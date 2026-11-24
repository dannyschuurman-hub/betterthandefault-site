// Cloudflare Pages Function: POST /api/waitlist, GET /api/waitlist?u=<token> (unsubscribe).
// Needs a KV namespace bound as WAITLIST. Optional secret WAITLIST_SALT (any long random string) for hashing IPs.
// Stores only: email, language, timestamp, a consent-text version and an unsubscribe token. No IP address is stored.

const CONSENT_VERSION = '2411-v1';
const MAX_PER_HOUR_PER_IP = 5;      // sign-up attempts per IP per hour
const MAX_PER_HOUR_TOTAL = 200;     // global brake against scripted floods (KV is eventually consistent, so this is approximate)
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha(text) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }

async function bump(kv, key, limit) {
  const n = parseInt((await kv.get(key)) || '0', 10);
  if (n >= limit) return false;
  await kv.put(key, String(n + 1), { expirationTtl: 3700 });
  return true;
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const wantsHtml = (request.headers.get('accept') || '').includes('text/html') && !(request.headers.get('content-type') || '').includes('json');
  const fail = (error, status, lang) =>
    wantsHtml ? Response.redirect(`${url.origin}${lang === 'nl' ? '/nl' : ''}/download/?waitlist=${error}#wl`, 303) : json({ ok: false, error }, status);
  const done = (lang) =>
    wantsHtml ? Response.redirect(`${url.origin}${lang === 'nl' ? '/nl' : ''}/download/?waitlist=ok#wl`, 303) : json({ ok: true });

  if (!env.WAITLIST) return json({ ok: false, error: 'server' }, 500);

  // same-origin only
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ ok: false, error: 'origin' }, 403);

  // body (JSON from the page script, or a plain form post without JavaScript)
  let b = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const text = await request.text();
      if (text.length > 2000) return json({ ok: false, error: 'size' }, 413);
      b = JSON.parse(text);
    } else if (ct.includes('form')) {
      const f = await request.formData();
      b = { email: f.get('email'), consent: f.get('consent') === '1', lang: f.get('lang'), company: f.get('company') };
    } else return json({ ok: false, error: 'type' }, 415);
  } catch (_) { return json({ ok: false, error: 'body' }, 400); }

  const lang = b.lang === 'nl' ? 'nl' : 'en';

  // honeypot: bots fill the hidden field. Pretend it worked, store nothing.
  if (typeof b.company === 'string' && b.company.trim() !== '') return done(lang);

  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !EMAIL_RE.test(email) || email.includes('..')) return fail('email', 400, lang);
  if (b.consent !== true) return fail('consent', 400, lang);

  // rate limits (hashed IP, one-hour buckets, keys expire by themselves)
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const hour = Math.floor(Date.now() / 3600000);
  const ipHash = (await sha(`${env.WAITLIST_SALT || 'btd'}|${ip}`)).slice(0, 24);
  if (!(await bump(env.WAITLIST, `rl:ip:${ipHash}:${hour}`, MAX_PER_HOUR_PER_IP))) return fail('rate', 429, lang);
  if (!(await bump(env.WAITLIST, `rl:all:${hour}`, MAX_PER_HOUR_TOTAL))) return fail('rate', 429, lang);

  const key = `e:${email}`;
  if (!(await env.WAITLIST.get(key))) {
    const token = hex(crypto.getRandomValues(new Uint8Array(16)));
    const rec = { email, lang, at: new Date().toISOString(), consent: CONSENT_VERSION, token };
    await env.WAITLIST.put(key, JSON.stringify(rec));
    await env.WAITLIST.put(`t:${token}`, email);
  }
  // Same answer whether or not the address was already there (does not reveal who is on the list).
  return done(lang);
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('u') || '').toLowerCase();
  const page = (t, body) =>
    new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t}</title><body style="font:17px/1.5 system-ui;max-width:32rem;margin:15vh auto;padding:0 20px"><h1 style="font-size:28px">${t}</h1><p>${body}</p>`,
      { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  if (!env.WAITLIST || !/^[0-9a-f]{32}$/.test(token)) return page('Link not valid', 'This unsubscribe link is not valid.');
  const email = await env.WAITLIST.get(`t:${token}`);
  if (email) { await env.WAITLIST.delete(`e:${email}`); await env.WAITLIST.delete(`t:${token}`); }
  return page('Removed', 'Your email address is removed from the Better Than Default waitlist. Verwijderd van de wachtlijst.');
}

export async function onRequest() { return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, POST' } }); }
