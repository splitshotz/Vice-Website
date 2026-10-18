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

  const bar = $('.bar');
  const heroMark = $('.hero-mark');
  if (bar && heroMark && 'IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => bar.toggleAttribute('data-hero-visible', en.isIntersecting), {
      rootMargin: '-80px 0px 0px 0px',
    }).observe(heroMark);
  }

  // ── The bar as voxels ──────────────────────────────────────────────
  // The bar's surface is a grid of square cells. Cells over text, images
  // and controls on the page shrink away, cells next to them settle as a
  // halftone fringe, and the rest close up into a solid bar.
  if (bar && 'ResizeObserver' in window) voxelBar(bar);

  function voxelBar(bar) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    cv.className = 'bar-voxels';
    cv.setAttribute('aria-hidden', 'true');
    bar.prepend(cv);
    bar.classList.add('voxel');

    const CELL = 7;
    const MARGIN = 4;
    const RINGS = [0, 0.26, 0.45, 0.64, 0.82];
    const TEXT = 'main h1, main h2, main h3, main p, main li, main dt, main dd, main th, main td, .foot nav a, .foot p';
    const BOX = 'main img, main video, .demo, main .cmd, main .seg, main .btn, main kbd, main .pills li, .people a, .swatches-inline, .wordmark-foot';
    let cols = 0, rows = 0, w = 0, h = 0, dpr = 1;
    let vals = new Float32Array(0), want = new Float32Array(0), rate = new Float32Array(0), ring = new Uint8Array(0);
    let shapes = [];
    let surface = '', accent = '';
    let running = false;

    const readColours = () => {
      const cs = getComputedStyle(root);
      surface = cs.getPropertyValue('--surface').trim();
      accent = cs.getPropertyValue('--base').trim();
      kick();
    };
    new MutationObserver(readColours).observe(root, {attributes: true, attributeFilter: ['data-accent']});

    function size() {
      const r = bar.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      vals = new Float32Array(cols * rows).fill(1);
      want = new Float32Array(cols * rows).fill(1);
      rate = new Float32Array(cols * rows).map(() => (reduce ? 1 : 0.14 + Math.random() * 0.2));
      ring = new Uint8Array(cols * rows);
      kick();
    }

    // Page-space boxes, so scrolling needs no layout reads. Text is taken
    // line by line, which is what lets the bar hug a paragraph's shape.
    function collect() {
      const out = [];
      // A line's box includes the font's whole ascent and descent, which on
      // display type reaches well past the letters, so text is trimmed to
      // roughly cap height and baseline.
      const add = (b, text) => {
        if (!(b.width > 0 && b.height > 0)) return;
        const t = text ? b.top + b.height * 0.2 : b.top;
        const bt = text ? b.bottom - b.height * 0.16 : b.bottom;
        out.push([b.left, t + scrollY, b.right, bt + scrollY]);
      };
      const range = document.createRange();
      for (const el of document.querySelectorAll(TEXT)) {
        if (!el.offsetParent || el.closest('.bar')) continue;
        range.selectNodeContents(el);
        for (const b of range.getClientRects()) add(b, true);
      }
      for (const el of document.querySelectorAll(BOX)) {
        if (!el.offsetParent || el.closest('.bar')) continue;
        add(el.getBoundingClientRect());
      }
      shapes = out;
      kick();
    }

    function targets() {
      const br = bar.getBoundingClientRect();
      want.fill(1);
      const top = br.top + scrollY - MARGIN;
      const bottom = br.bottom + scrollY + MARGIN;
      for (const [l, t, r, b] of shapes) {
        if (b < top || t > bottom || r < br.left - MARGIN || l > br.right + MARGIN) continue;
        const c0 = Math.max(0, Math.floor((l - MARGIN - br.left) / CELL));
        const c1 = Math.min(cols - 1, Math.floor((r + MARGIN - br.left) / CELL));
        const r0 = Math.max(0, Math.floor((t - MARGIN - (br.top + scrollY)) / CELL));
        const r1 = Math.min(rows - 1, Math.floor((b + MARGIN - (br.top + scrollY)) / CELL));
        for (let y = r0; y <= r1; y++) want.fill(0, y * cols + c0, y * cols + c1 + 1);
      }
      // Rings of cells growing back to full size around every gap.
      const reach = RINGS.length - 1;
      ring.fill(0);
      for (let i = 0; i < want.length; i++) {
        if (want[i] !== 0) continue;
        const x = i % cols, y = (i / cols) | 0;
        for (let dy = -reach; dy <= reach; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= rows) continue;
          for (let dx = -reach; dx <= reach; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= cols) continue;
            const j = yy * cols + xx;
            const d = Math.max(Math.abs(dx), Math.abs(dy));
            if (want[j] !== 0 && (!ring[j] || d < ring[j])) ring[j] = d;
          }
        }
      }
      for (let i = 0; i < want.length; i++) if (ring[i]) want[i] = RINGS[ring[i]];
    }

    function draw() {
      targets();
      let moving = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < vals.length; i++) {
        const d = want[i] - vals[i];
        if (Math.abs(d) > 0.01) {
          vals[i] += d * rate[i];
          moving = true;
        } else vals[i] = want[i];
      }
      ctx.fillStyle = surface;
      for (let pass = 0; pass < 2; pass++) {
        if (pass) ctx.fillStyle = accent;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const v = vals[y * cols + x];
            if (v < 0.05) continue;
            if (v >= 0.97) {
              if (!pass) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
              continue;
            }
            // Smaller cells sit nearer the content and glow more.
            if (pass) ctx.globalAlpha = Math.min(1, (1 - v) * 1.25);
            const s = CELL * (0.25 + v * 0.62);
            const o = (CELL - s) / 2;
            ctx.fillRect(x * CELL + o, y * CELL + o, s, s);
          }
        }
      }
      ctx.globalAlpha = 1;
      return moving;
    }

    let lastScroll = 0;
    function tick() {
      const moving = draw();
      if (moving || performance.now() - lastScroll < 200) requestAnimationFrame(tick);
      else running = false;
    }
    function kick() {
      if (running || !cols) return;
      running = true;
      requestAnimationFrame(tick);
    }

    let collectTimer = 0;
    addEventListener('scroll', () => {
      lastScroll = performance.now();
      kick();
      // Reveal animations move things as they arrive, so look again once
      // scrolling settles.
      clearTimeout(collectTimer);
      collectTimer = setTimeout(collect, 260);
    }, {passive: true});
    new ResizeObserver(size).observe(bar);
    new ResizeObserver(() => collect()).observe(document.body);
    addEventListener('load', collect);
    for (const b of $$('[data-tab]')) b.addEventListener('click', () => setTimeout(collect, 0));
    readColours();
    size();
    collect();
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
      if (f >= at) active = i;
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
