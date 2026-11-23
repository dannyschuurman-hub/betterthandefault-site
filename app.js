(() => {
  const d = document, root = d.documentElement;
  const qs = (s, r = d) => r.querySelector(s), qsa = (s, r = d) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const part = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  root.classList.add('js');
  if (!reduced) root.classList.add('live');

  const hero = qs('.hero');
  const caps = qsa('.cap');
  const heroImgs = qsa('.hero-phone .screen img');
  const dots = qsa('.trail .d');
  const rail = qsa('.pill .rail i');
  const stickyImgs = qsa('.sticky-phone .screen img');
  const steps = qsa('.step');
  let ticking = false;

  const show = (imgs, i) => imgs.forEach((im, k) => im.classList.toggle('on', k === i));

  function frame() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    if (hero && root.classList.contains('live')) {
      const span = Math.max(1, hero.offsetHeight - vh);
      const p = clamp((y - hero.offsetTop) / span);
      hero.style.setProperty('--p', p.toFixed(4));
      hero.style.setProperty('--out', ease(part(p, 0.03, 0.16)).toFixed(4));
      hero.style.setProperty('--a', ease(part(p, 0.05, 0.23)).toFixed(4));
      const idx = p < 0.17 ? -1 : p < 0.42 ? 0 : p < 0.68 ? 1 : 2;
      caps.forEach((c, k) => c.classList.toggle('on', k === idx));
      show(heroImgs, Math.max(0, idx));
      const better = Math.floor(part(p, 0.2, 0.98) * 10);
      hero.style.setProperty('--calm', (better / 10).toFixed(2));
      dots.forEach((dt, k) => dt.classList.toggle('better', k < better));
    } else if (heroImgs.length) {
      show(heroImgs, 0);
    }
    const total = Math.max(1, d.documentElement.scrollHeight - vh);
    const prog = clamp(y / total);
    const lit = Math.max(1, Math.ceil(prog * rail.length));
    rail.forEach((r, k) => r.classList.toggle('on', k < lit));
  }
  const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  frame();

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -4% 0px' });
    qsa('.rv,.stg').forEach((el) => io.observe(el));
    const so = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) {
        steps.forEach((s) => s.classList.toggle('on', s === e.target));
        show(stickyImgs, +e.target.dataset.i);
      }
    }), { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    steps.forEach((s) => so.observe(s));
  } else {
    qsa('.rv,.stg').forEach((el) => el.classList.add('in'));
    steps.forEach((s) => s.classList.add('on'));
  }
  if (steps[0]) steps[0].classList.add('on');
})();
