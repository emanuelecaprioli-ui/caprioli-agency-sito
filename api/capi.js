// Caprioli Agency · API Conversioni di Meta (lato server, Vercel)
// Riceve dal sito gli stessi eventi del Pixel (con lo stesso event_id, per la deduplicazione)
// e li inoltra a Meta. Il token resta solo nelle variabili d'ambiente di Vercel: META_CAPI_TOKEN.
// Facoltativo per i test: META_TEST_EVENT_CODE (codice da "Testa eventi" in Gestione eventi).
const crypto = require('crypto');

const PIXEL_ID = '1234646455434911';
const GRAPH = 'https://graph.facebook.com/v26.0/';
const ALLOWED_EVENTS = new Set(['PageView', 'Contact', 'Schedule', 'Lead']);
const ALLOWED_ORIGIN = /^https:\/\/(www\.)?caprioliagency\.com$/;

const sha256 = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function normalizePhone(p) {
  let d = String(p || '').replace(/[^0-9]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('3')) d = '39' + d; // cellulare italiano senza prefisso
  return d.length >= 8 ? d : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGIN.test(origin)) { res.status(403).end(); return; }

  const token = process.env.META_CAPI_TOKEN;
  if (!token) { res.status(204).end(); return; } // non ancora configurato: non fa nulla

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  if (!ALLOWED_EVENTS.has(body.event_name) || !body.event_id) { res.status(400).end(); return; }

  const cookies = parseCookies(req.headers.cookie);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const userData = {
    client_ip_address: ip || undefined,
    client_user_agent: req.headers['user-agent'] || undefined,
    fbp: cookies._fbp || undefined,
    fbc: cookies._fbc || undefined,
  };
  if (body.email) userData.em = [sha256(body.email)];
  const phone = normalizePhone(body.phone);
  if (phone) userData.ph = [sha256(phone)];

  const customData = {};
  ['posizione', 'metodo'].forEach((k) => { if (body.custom_data && body.custom_data[k]) customData[k] = String(body.custom_data[k]).slice(0, 80); });

  const url = typeof body.url === 'string' && body.url.startsWith('https://') ? body.url.slice(0, 500) : undefined;

  const payload = {
    data: [{
      event_name: body.event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(body.event_id).slice(0, 100),
      action_source: 'website',
      event_source_url: url,
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (process.env.META_TEST_EVENT_CODE) payload.test_event_code = process.env.META_TEST_EVENT_CODE;

  try {
    const r = await fetch(GRAPH + PIXEL_ID + '/events?access_token=' + encodeURIComponent(token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok });
  } catch (e) {
    res.status(502).json({ ok: false });
  }
};
