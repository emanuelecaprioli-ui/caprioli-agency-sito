/* Caprioli Agency · consenso cookie + misurazione (GA4, Pixel Meta)
   Nessuno strumento di statistica o marketing parte prima del consenso.
   Il consenso resta salvato nel browser per 6 mesi (chiave "ca_consent"). */
(function () {
  'use strict';

  var GA_ID = 'G-LBV7YH7CS4';
  var PIXEL_ID = '1234646455434911';
  var KEY = 'ca_consent';
  var VERSION = 1;
  var MAX_AGE = 1000 * 60 * 60 * 24 * 182; // circa 6 mesi

  /* ---------- consenso salvato ---------- */
  function readConsent() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!c || c.v !== VERSION || Date.now() - c.ts > MAX_AGE) return null;
      return c;
    } catch (e) { return null; }
  }
  function saveConsent(stat, mkt) {
    var c = { v: VERSION, stat: !!stat, mkt: !!mkt, ts: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    return c;
  }

  /* ---------- Google Analytics 4 (solo con consenso statistiche) ---------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied',
    ad_user_data: 'denied', ad_personalization: 'denied'
  });
  var gaLoaded = false;
  function loadGA() {
    if (gaLoaded) return;
    gaLoaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  /* ---------- Pixel Meta (solo con consenso marketing) ---------- */
  var pixelLoaded = false;
  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
    sendMeta('PageView', {});
  }

  function apply(c) {
    if (!c) return;
    if (c.stat) loadGA();
    if (c.mkt) loadPixel();
  }

  /* ---------- eventi ---------- */
  // ga: nome evento GA4; meta: evento standard Meta (facoltativo)
  function track(ga, params, meta, extra) {
    params = params || {};
    if (gaLoaded) gtag('event', ga, params);
    if (pixelLoaded && meta) sendMeta(meta, params, extra);
  }

  // Pixel + API Conversioni con lo stesso event_id (Meta deduplica)
  function sendMeta(name, params, extra) {
    var id = name + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    if (window.fbq) window.fbq('track', name, params || {}, { eventID: id });
    var body = { event_name: name, event_id: id, url: location.href.split('#')[0], custom_data: params || {} };
    if (extra) { if (extra.email) body.email = extra.email; if (extra.phone) body.phone = extra.phone; }
    try {
      fetch('/api/capi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true, credentials: 'same-origin' });
    } catch (e) {}
  }
  window.caTrack = track;

  function where(el) {
    var s = el.closest('section[id], header, footer, dialog[id]');
    if (!s) return 'pagina';
    return s.id || s.tagName.toLowerCase();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a, button');
    if (!a || a.closest('#ca-cookie')) return;
    var label = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (a.hasAttribute('data-cal')) {
      track('apertura_calendario', { posizione: where(a), testo: label }, 'Contact');
    } else if (a.hasAttribute('data-book')) {
      track('apertura_mini_guida', { posizione: where(a), testo: label });
    } else if ((a.getAttribute('href') || '').indexOf('tel:') === 0) {
      track('click_telefono', { posizione: where(a) }, 'Contact');
    } else if ((a.getAttribute('href') || '').indexOf('mailto:') === 0) {
      track('click_email', { posizione: where(a) }, 'Contact');
    } else if (a.classList.contains('btn')) {
      track('click_pulsante', { posizione: where(a), testo: label });
    }
  }, true);

  // Calendly: messaggi dal calendario incorporato
  window.addEventListener('message', function (e) {
    if (!/^https:\/\/([a-z0-9-]+\.)*calendly\.com$/.test(e.origin || '')) return;
    var ev = e.data && e.data.event;
    if (ev === 'calendly.date_and_time_selected') track('calendario_orario_scelto', {});
    if (ev === 'calendly.event_scheduled') track('call_prenotata', {}, 'Schedule');
  });

  // Mini guida: invio riuscito quando compare il blocco #book-ok
  function watchBook() {
    var ok = document.getElementById('book-ok');
    if (!ok || !window.MutationObserver) return;
    var sent = false;
    new MutationObserver(function () {
      if (!sent && !ok.hidden) {
        sent = true;
        var f = document.getElementById('book-form');
        var em = f && f.querySelector('[name=email]'), ph = f && f.querySelector('[name=telefono]');
        track('generate_lead', { metodo: 'mini_guida' }, 'Lead', { email: em && em.value, phone: ph && ph.value });
      }
    }).observe(ok, { attributes: true, attributeFilter: ['hidden'] });
  }

  // UTM: passa i parametri della visita al calendario, cosi Calendly li registra sulla prenotazione
  function passUtm() {
    var keep = {};
    try {
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        if (q.get(k)) keep[k] = q.get(k);
      });
      if (Object.keys(keep).length) sessionStorage.setItem('ca_utm', JSON.stringify(keep));
      else keep = JSON.parse(sessionStorage.getItem('ca_utm') || '{}');
    } catch (e) {}
    if (typeof window.CALENDLY_URL === 'string' && window.CALENDLY_URL && Object.keys(keep).length) {
      var extra = Object.keys(keep).map(function (k) { return k + '=' + encodeURIComponent(keep[k]); }).join('&');
      window.CALENDLY_URL += (window.CALENDLY_URL.indexOf('?') < 0 ? '?' : '&') + extra;
    }
  }

  /* ---------- banner ---------- */
  var css = '' +
    '#ca-cookie{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;background:#FFFFFF;color:#0E1B3D;font-family:Figtree,system-ui,sans-serif;box-shadow:0 12px 40px rgba(5,10,30,.45);padding:24px 24px 20px}' +
    '#ca-cookie h2{margin:0 0 8px;font-family:Archivo,sans-serif;font-weight:800;font-size:20px;line-height:1.15}' +
    '#ca-cookie p{margin:0 0 16px;font-size:15px;line-height:1.5;color:#33406A}' +
    '#ca-cookie a{color:#0E1B3D;font-weight:700}' +
    '#ca-cookie .ca-row{display:flex;flex-wrap:wrap;gap:10px}' +
    '#ca-cookie button{flex:1 1 140px;min-height:46px;padding:12px 16px;font:700 15px Figtree,system-ui,sans-serif;cursor:pointer;border:2px solid #0E1B3D;background:#FFFFFF;color:#0E1B3D}' +
    '#ca-cookie button.ca-main{background:#0E1B3D;color:#FFFFFF}' +
    '#ca-cookie .ca-x{position:absolute;top:8px;right:10px;flex:none;min-height:0;width:36px;height:36px;padding:0;border:0;font-size:24px;line-height:1;background:transparent}' +
    '#ca-cookie .ca-opts{display:none;margin:0 0 16px;border-top:1px solid #E3E6F0}' +
    '#ca-cookie.ca-open .ca-opts{display:block}' +
    '#ca-cookie label{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #E3E6F0;font-size:15px;line-height:1.45;color:#33406A}' +
    '#ca-cookie label strong{color:#0E1B3D}' +
    '#ca-cookie input{width:20px;height:20px;margin:2px 0 0;flex:none}' +
    '@media (max-width:480px){#ca-cookie{left:0;right:0;bottom:0;padding:20px 16px 16px}}';

  function buildBanner() {
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    var b = document.createElement('div');
    b.id = 'ca-cookie';
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Preferenze cookie');
    b.hidden = true;
    b.innerHTML =
      '<button type="button" class="ca-x" data-ca="reject" aria-label="Chiudi e rifiuta i cookie non necessari">&times;</button>' +
      '<h2>Cookie</h2>' +
      '<p>Uso cookie tecnici per far funzionare il sito. Con il tuo consenso uso anche Google Analytics per contare le visite e il Pixel di Meta per misurare le campagne. Dettagli nella <a href="/cookie">Cookie Policy</a>.</p>' +
      '<div class="ca-opts">' +
      '<label><input type="checkbox" checked disabled><span><strong>Tecnici</strong> · sempre attivi, servono al funzionamento del sito.</span></label>' +
      '<label><input type="checkbox" id="ca-stat"><span><strong>Statistica</strong> · Google Analytics: quante persone visitano il sito e cosa guardano.</span></label>' +
      '<label><input type="checkbox" id="ca-mkt"><span><strong>Marketing</strong> · Pixel di Meta: misura i risultati delle inserzioni su Facebook e Instagram.</span></label>' +
      '</div>' +
      '<div class="ca-row">' +
      '<button type="button" data-ca="reject">Rifiuta</button>' +
      '<button type="button" data-ca="custom" class="ca-custom">Personalizza</button>' +
      '<button type="button" data-ca="accept" class="ca-main">Accetta tutti</button>' +
      '</div>';
    document.body.appendChild(b);

    b.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ca]');
      if (!t) return;
      var act = t.getAttribute('data-ca');
      if (act === 'custom') {
        if (!b.classList.contains('ca-open')) {
          b.classList.add('ca-open');
          t.textContent = 'Salva le scelte';
          return;
        }
        close(saveConsent(document.getElementById('ca-stat').checked, document.getElementById('ca-mkt').checked));
      } else if (act === 'accept') {
        close(saveConsent(true, true));
      } else {
        close(saveConsent(false, false));
      }
    });
    return b;
  }

  var banner;
  function open() {
    banner = banner || buildBanner();
    var c = readConsent();
    document.getElementById('ca-stat').checked = !!(c && c.stat);
    document.getElementById('ca-mkt').checked = !!(c && c.mkt);
    banner.hidden = false;
  }
  function close(c) {
    var had = { stat: gaLoaded, mkt: pixelLoaded };
    banner.hidden = true;
    banner.classList.remove('ca-open');
    var cb = banner.querySelector('.ca-custom');
    if (cb) cb.textContent = 'Personalizza';
    // se l'utente revoca un consenso dato prima, ricarico la pagina per fermare gli script
    if ((had.stat && !c.stat) || (had.mkt && !c.mkt)) { location.reload(); return; }
    apply(c);
  }
  window.caOpenCookie = open;

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-consent-open]');
    if (!t) return;
    e.preventDefault();
    open();
  });

  function start() {
    passUtm();
    watchBook();
    var c = readConsent();
    if (c) apply(c); else open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
