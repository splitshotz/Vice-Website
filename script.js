(() => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ── Material 3 Expressive shapes ───────────────────────────────────
  // Two families from the M3 shape library, used only for the recording
  // figures. Scalloped shapes (cookies, clovers) are a circle with round
  // bumps meeting in tight notches; bursts are star polygons with rounded
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
      themeShots();
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

  // ── The hero: a real clip with Vice working over it ─────────────────
  // Everything is driven by the video's own clock, so each loop tells the
  // same story: buffer running, keys moving, F9 at the collapse, link copied.
  const demo = $('[data-demo]');
  if (demo) {
    const island = $('[data-demo-island]');
    const text = $('.demo-island-text', island);
    const meta = $('.demo-island-meta', island);
    const toast = $('[data-demo-toast]');
    const fill = $('[data-demo-fill]');
    const caps = new Map($$('[data-demo-keys] [data-k]').map(el => [el.dataset.k, el]));
    // [from, to, key] in seconds of the hero clip.
    const KEYS = [
      [0.0, 2.6, 'KeyW'], [0.4, 1.6, 'Shift'], [1.2, 1.9, 'KeyA'], [2.9, 3.2, 'Space'],
      [3.3, 5.1, 'KeyW'], [3.6, 4.4, 'KeyD'], [4.6, 4.8, 'KeyR'], [5.4, 6.3, 'KeyS'],
      [6.5, 8.6, 'KeyW'], [6.9, 7.6, 'KeyA'], [7.8, 8.0, 'Space'],
    ];
    const SAVE_AT = 6.2;
    let state = '';
    function setIsland(next) {
      if (next === state) return;
      state = next;
      island.dataset.state = next;
      if (next === 'saved') {
        text.textContent = 'Clip saved';
        meta.textContent = 'building-is-GONE';
      } else {
        text.textContent = 'Buffer running';
        meta.textContent = '2:00';
      }
    }
    const frame = () => {
      const t = demo.currentTime || 0;
      for (const [k, el] of caps) {
        const on = KEYS.some(([a, b, key]) => key === k && t >= a && t < b);
        if (on !== el.classList.contains('on')) el.classList.toggle('on', on);
      }
      setIsland(t >= SAVE_AT && t < SAVE_AT + 2.6 ? 'saved' : 'idle');
      toast.classList.toggle('show', t >= SAVE_AT + 0.9 && t < SAVE_AT + 2.9);
      if (fill && demo.duration) fill.style.transform = `scaleX(${t / demo.duration})`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    if (reduce) {
      demo.removeAttribute('autoplay');
      demo.pause();
    }
  }

  // ── Screenshots in the page's colour ───────────────────────────────
  function themeShots() {
    const accent = current();
    for (const img of $$('img[data-shot]')) {
      const want = `assets/shots/${accent}/${img.dataset.shot}.webp`;
      if (img.getAttribute('src') !== want) img.setAttribute('src', want);
    }
  }
  themeShots();

  // ── The rail: the page as a two minute buffer ──────────────────────
  // Each mark sits where the fill will be when its section takes over, so
  // a mark lights exactly as the fill reaches it.
  const fill = $('.rail-fill');
  const time = $('[data-time]');
  const marks = $$('[data-mark]');
  let stops = [];
  const maxScroll = () => document.documentElement.scrollHeight - innerHeight;
  function placeMarks() {
    const max = maxScroll();
    stops = marks.map(m => {
      const sec = document.querySelector(m.getAttribute('href'));
      if (!sec || max <= 0) return 1;
      const top = sec.getBoundingClientRect().top + scrollY;
      return Math.min(1, Math.max(0, (top - innerHeight * 0.45) / max));
    });
    marks.forEach((m, i) => m.parentElement.style.setProperty('--at', `${stops[i] * 100}%`));
  }
  function onScroll() {
    const max = maxScroll();
    const f = max > 0 ? Math.min(1, scrollY / max) : 0;
    if (fill) fill.style.transform = `scaleY(${f})`;
    if (time) {
      const s = Math.round(f * 120);
      time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    let active = -1;
    stops.forEach((at, i) => {
      if (f >= at - 0.002) active = i;
    });
    marks.forEach((m, i) => m.toggleAttribute('data-active', i === active));
  }
  const relayout = () => {
    placeMarks();
    onScroll();
  };
  addEventListener('scroll', onScroll, {passive: true});
  addEventListener('resize', relayout);
  addEventListener('load', relayout);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
  relayout();

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
