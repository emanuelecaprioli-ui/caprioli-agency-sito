// Caprioli Agency · lead magnet "Medico online" (lato server, Vercel)
// 1) salva il contatto nella lista Brevo "Mini guida - Medico online"
// 2) invia al medico l'email con la mini guida
// 3) invia una notifica a Emanuele
// La chiave resta solo nelle variabili d'ambiente di Vercel: BREVO_API_KEY.
const BREVO = 'https://api.brevo.com/v3/';
const LIST_ID = 3;
const SENDER = { name: 'Emanuele Caprioli', email: 'emanuele.caprioli@caprioliagency.com' };
const NOTIFY_TO = 'emanuele.caprioli@caprioliagency.com';
const PDF_URL = 'https://www.caprioliagency.com/assets/manuale-medico-online.pdf';
const ALLOWED_ORIGIN = /^https:\/\/(www\.)?caprioliagency\.com$/;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function phoneE164(p) {
  let d = String(p || '').replace(/[^0-9+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (!d.startsWith('+')) {
    const n = d.replace(/\D/g, '');
    if (n.length === 10 && n.startsWith('3')) d = '+39' + n; else return '';
  }
  return /^\+[0-9]{8,15}$/.test(d) ? d : '';
}

let diag = [];
async function brevo(path, body, key) {
  const r = await fetch(BREVO + path, {
    method: 'POST',
    headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let code = '';
    try { code = (await r.json()).code || ''; } catch (e) {}
    diag.push(path.split('/')[0] + ':' + r.status + (code ? ':' + code : ''));
  }
  return r.ok;
}

function leadEmail(nome) {
  const first = esc(String(nome || '').trim().split(/\s+/)[0] || '');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#0E1B3D;max-width:560px">' +
    '<p>Ciao' + (first ? ' ' + first : '') + ',</p>' +
    '<p>come promesso, ecco la mini guida <strong>«Medico online: cosa puoi fare e cosa no»</strong>.</p>' +
    '<p><a href="' + PDF_URL + '" style="display:inline-block;background:#F5C518;color:#0E1B3D;padding:14px 22px;font-weight:bold;text-decoration:none">Scarica la mini guida (PDF)</a></p>' +
    '<p>Se dopo averla letta vuoi capire come applicarla al tuo studio, puoi prenotare una call gratuita con me da <a href="https://www.caprioliagency.com/#call" style="color:#0E1B3D">caprioliagency.com</a>, oppure rispondere direttamente a questa email.</p>' +
    '<p>Emanuele Caprioli<br>Caprioli Agency</p>' +
    '</div>';
}

function notifyEmail(d) {
  const row = (k, v) => '<tr><td style="padding:4px 12px 4px 0;color:#555">' + k + '</td><td style="padding:4px 0"><strong>' + esc(v || '—') + '</strong></td></tr>';
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px">' +
    '<p>Nuova richiesta della mini guida dal sito.</p><table>' +
    row('Nome', d.nome) + row('Email', d.email) + row('Telefono', d.telefono) +
    row('Fonte', d.utm_source) + row('Mezzo', d.utm_medium) + row('Campagna', d.utm_campaign) + row('Contenuto', d.utm_content) +
    row('Pagina', d.pagina) +
    '</table><p>Il contatto è nella lista Brevo "Mini guida - Medico online".</p></div>';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGIN.test(origin)) { res.status(403).end(); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  if (b.botcheck) { res.status(200).json({ ok: true }); return; } // trappola anti-spam
  const email = String(b.email || '').trim().slice(0, 200);
  const nome = String(b.nome || '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nome || !b.privacy) { res.status(400).json({ ok: false }); return; }

  diag = [];
  const key = process.env.BREVO_API_KEY;
  if (!key) { res.status(200).json({ ok: true, email_sent: false, diag: ['no_key'] }); return; }

  const parts = nome.split(/\s+/);
  const attributes = { FIRSTNAME: parts[0], LASTNAME: parts.slice(1).join(' ') };
  const sms = phoneE164(b.telefono);
  if (sms) attributes.SMS = sms;

  const data = {
    nome, email, telefono: String(b.telefono || '').slice(0, 40),
    utm_source: String(b.utm_source || '').slice(0, 80), utm_medium: String(b.utm_medium || '').slice(0, 80),
    utm_campaign: String(b.utm_campaign || '').slice(0, 120), utm_content: String(b.utm_content || '').slice(0, 120),
    pagina: String(b.pagina || '').slice(0, 300),
  };

  try {
    let saved = await brevo('contacts', { email, attributes, listIds: [LIST_ID], updateEnabled: true }, key);
    if (!saved && sms) { // se Brevo rifiuta il telefono, salva senza
      delete attributes.SMS;
      saved = await brevo('contacts', { email, attributes, listIds: [LIST_ID], updateEnabled: true }, key);
    }
    const sent = await brevo('smtp/email', {
      sender: SENDER, replyTo: SENDER, to: [{ email, name: nome }],
      subject: 'La tua mini guida «Medico online: cosa puoi fare e cosa no»',
      htmlContent: leadEmail(nome), tags: ['mini-guida'],
    }, key);
    await brevo('smtp/email', {
      sender: SENDER, replyTo: { email, name: nome }, to: [{ email: NOTIFY_TO }],
      subject: 'Nuovo lead mini guida: ' + nome,
      htmlContent: notifyEmail(data), tags: ['notifica-lead'],
    }, key);
    res.status(200).json({ ok: true, saved, email_sent: sent, diag });
  } catch (e) {
    res.status(200).json({ ok: true, email_sent: false });
  }
};
