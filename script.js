(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ── Material 3 Expressive shapes ───────────────────────────────────
  // Two families from the M3 shape library. Scalloped shapes (cookies,
  // clovers) are a circle with round bumps meeting in tight notches, and the
  // bump depth can run down to zero, which is what lets the F9 key morph from
  // a cookie into a circle honestly. Bursts are star polygons with rounded
  // corners.
  const SHAPES = {
    cookie6: {kind: 'scallop', n: 6, a: 0.2, e: 0.15},
    cookie9: {kind: 'scallop', n: 9, a: 0.15, e: 0.07},
    cookie12: {kind: 'scallop', n: 12, a: 0.1, e: 0.15},
    clover4: {kind: 'scallop', n: 4, a: 0.35, e: 0.08},
    clover8: {kind: 'scallop', n: 8, a: 0.22, e: 0.1},
    burst: {kind: 'star', n: 12, k: 0.78, r: 0.42},
    sunny: {kind: 'star', n: 8, k: 0.86, r: 0.48},
  };

  const f2 = v => v.toFixed(2);

  function scallopPath({n, a, e}, rot = 0) {
    const pts = [];
    const steps = 360;
    const norm = Math.sqrt(1 + e * e);
    for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const c = Math.abs(Math.cos((n * (t + rot)) / 2));
      const r = (1 - a * (1 - Math.sqrt(c * c + e * e) / norm)) * 50;
      pts.push(f2(50 + r * Math.cos(t)) + ' ' + f2(50 + r * Math.sin(t)));
    }
    return 'M' + pts.join('L') + 'Z';
  }

  function starPath({n, k, r: round}) {
    const pts = [];
    for (let i = 0; i < 2 * n; i++) {
      const rad = i % 2 ? 50 * k : 50;
      const t = -Math.PI / 2 + (i * Math.PI) / n;
      pts.push([50 + rad * Math.cos(t), 50 + rad * Math.sin(t)]);
    }
    const lerp = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    let d = '';
    pts.forEach((p1, i) => {
      const p0 = pts[(i + pts.length - 1) % pts.length];
      const p2 = pts[(i + 1) % pts.length];
      const a = lerp(p1, p0, round);
      const b = lerp(p1, p2, round);
      const c1 = lerp(a, p1, 0.55);
      const c2 = lerp(b, p1, 0.55);
      d += (i ? 'L' : 'M') + f2(a[0]) + ' ' + f2(a[1]);
      d += 'C' + [c1, c2, b].map(q => f2(q[0]) + ' ' + f2(q[1])).join(' ');
    });
    return d + 'Z';
  }

  const shapePath = spec => (spec.kind === 'star' ? starPath(spec) : scallopPath(spec));

  for (const el of $$('[data-shape]')) {
    const spec = SHAPES[el.dataset.shape];
    if (!spec) continue;
    el.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="' + shapePath(spec) + '"/></svg>';
  }

  // ── Accent colour ──────────────────────────────────────────────────
  const root = document.documentElement;
  const current = () => root.dataset.accent || 'blue';
  function markSwatches() {
    for (const b of $$('[data-swatch]')) b.setAttribute('aria-checked', String(b.dataset.swatch === current()));
  }
  for (const b of $$('[data-swatch]')) {
    b.addEventListener('click', () => {
      root.dataset.accent = b.dataset.swatch;
      try {
        localStorage.setItem('vice-site-accent', b.dataset.swatch);
      } catch (e) {}
      markSwatches();
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim();
    });
  }
  markSwatches();

  // ── Install tabs and copy buttons ──────────────────────────────────
  for (const tab of $$('[data-tab]')) {
    tab.addEventListener('click', () => {
      const box = tab.closest('.install');
      for (const t of $$('[data-tab]', box)) t.setAttribute('aria-selected', String(t === tab));
      for (const p of $$('[data-panel]', box)) p.hidden = p.dataset.panel !== tab.dataset.tab;
    });
  }
  for (const btn of $$('[data-copy]')) {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copied';
      } catch (e) {
        const code = btn.parentElement.querySelector('code');
        getSelection().selectAllChildren(code);
        btn.textContent = 'Selected';
      }
      setTimeout(() => (btn.textContent = 'Copy'), 1600);
    });
  }

  // ── The F9 key ─────────────────────────────────────────────────────
  const cookie = $('[data-cookie]');
  const press = $('[data-press]');
  const island = $('[data-island]');
  const islandBox = island && island.closest('.island');
  const restSpec = SHAPES.cookie9;
  let amp = restSpec.a;
  let rot = 0;
  let target = restSpec.a;
  function drawCookie() {
    cookie.setAttribute('d', scallopPath({...restSpec, a: amp}, rot));
  }
  if (cookie) {
    drawCookie();
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(48, now - last);
      last = now;
      // A slow turn at rest, and a spring towards the target shape.
      if (!reduce) rot += dt * 0.00004;
      amp += (target - amp) * Math.min(1, dt * 0.012);
      drawCookie();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const lines = ['Clip saved', 'holy-snipe, 20 s', 'Link copied'];
  let busy = false;
  async function save() {
    if (busy) return;
    busy = true;
    press.classList.add('down');
    target = 0;
    islandBox.classList.add('live');
    await wait(180);
    press.classList.remove('down');
    for (const line of lines) {
      island.textContent = line;
      islandBox.classList.remove('pop');
      void islandBox.offsetWidth;
      islandBox.classList.add('pop');
      await wait(1100);
    }
    target = restSpec.a;
    island.textContent = 'Buffer running';
    islandBox.classList.remove('live');
    busy = false;
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (press) {
    press.addEventListener('click', save);
    if (!reduce) setTimeout(save, 1400);
  }

  // ── The rail: the page as a two minute buffer ──────────────────────
  const fill = $('.rail-fill');
  const time = $('[data-time]');
  const marks = $$('[data-mark]');
  function onScroll() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const f = max > 0 ? Math.min(1, scrollY / max) : 0;
    if (fill) fill.style.transform = `scaleY(${f})`;
    if (time) {
      const s = Math.round(f * 120);
      time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    let active = null;
    for (const m of marks) {
      const sec = document.querySelector(m.getAttribute('href'));
      if (sec && sec.getBoundingClientRect().top < innerHeight * 0.45) active = m;
    }
    for (const m of marks) m.toggleAttribute('data-active', m === active);
  }
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', onScroll);
  onScroll();

  // ── The keyboard overlay, driven by the visitor's own keys ─────────
  const keys = $('[data-keys]');
  if (keys) {
    const caps = new Map($$('[data-k]', keys).map(el => [el.dataset.k, el]));
    const codeFor = e => {
      if (e.key === 'Shift') return 'Shift';
      if (e.key === 'Control') return 'Control';
      return e.code;
    };
    let inView = false;
    let touched = false;
    new IntersectionObserver(([en]) => (inView = en.isIntersecting), {threshold: 0.3}).observe(keys);
    const set = (code, on) => {
      const cap = caps.get(code);
      if (cap) cap.classList.toggle('on', on);
      return Boolean(cap);
    };
    addEventListener('keydown', e => {
      if (!inView || e.target.closest('input, textarea, [contenteditable]')) return;
      if (set(codeFor(e), true)) {
        touched = true;
        if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      }
    });
    addEventListener('keyup', e => set(codeFor(e), false));
    addEventListener('blur', () => caps.forEach(c => c.classList.remove('on')));

    // Until the visitor plays along, a short strafe-and-jump on a loop.
    const demo = [
      [0, 'KeyW', 1], [300, 'Shift', 1], [900, 'KeyA', 1], [1300, 'Space', 1], [1450, 'Space', 0],
      [1700, 'KeyA', 0], [1900, 'KeyD', 1], [2500, 'KeyD', 0], [2700, 'Shift', 0], [3000, 'KeyW', 0],
      [3300, 'KeyR', 1], [3450, 'KeyR', 0], [3800, 'Digit2', 1], [3920, 'Digit2', 0],
    ];
    if (!reduce) {
      const loop = async () => {
        while (true) {
          if (inView && !touched) {
            let t = 0;
            for (const [at, code, on] of demo) {
              await wait(at - t);
              t = at;
              if (touched) break;
              set(code, Boolean(on));
            }
            await wait(1200);
          } else {
            await wait(400);
          }
        }
      };
      loop();
    }
  }

  // ── Reveal on scroll ───────────────────────────────────────────────
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      entries => {
        for (const en of entries) {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        }
      },
      {rootMargin: '0px 0px -12% 0px'},
    );
    for (const el of $$('main > section:not(.hero), .reveal')) {
      el.classList.add('pre');
      io.observe(el);
    }
  }
})();
