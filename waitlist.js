(() => {
  const f = document.querySelector('form.wl');
  if (!f) return;
  const msg = f.querySelector('.wl-msg'), btn = f.querySelector('button');
  const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('bad', !!bad); };
  const q = new URLSearchParams(location.search).get('waitlist');
  if (q) say(f.dataset[{ ok: 'ok', email: 'bad', consent: 'consent', rate: 'limit' }[q]] || f.dataset.err, q !== 'ok');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); return; }
    btn.disabled = true; say('…');
    try {
      const r = await fetch(f.action, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ email: f.email.value, consent: f.consent.checked, lang: f.lang.value, company: f.company.value })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { say(f.dataset.ok); f.reset(); }
      else say(f.dataset[{ email: 'bad', consent: 'consent', rate: 'limit' }[j.error]] || f.dataset.err, true);
    } catch (_) { say(f.dataset.err, true); }
    btn.disabled = false;
  });
})();
