(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const body = document.body;
  const page = body.dataset.page || 'home';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MONO = '500 9px "IBM Plex Mono", monospace';
  const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ICON = {
    mask: '<svg viewBox="0 0 48 48" fill="none"><path d="M6 10c6 5 30 5 36 0v14c0 12-9 18-18 18S6 36 6 24V10z" fill="#111"/><path d="M13 20c3-3 7-3 10 0M25 20c3-3 7-3 10 0" stroke="#dffd64" stroke-width="2.4" stroke-linecap="round"/><path d="M14 30c5 6 15 6 20 0" stroke="#ff704e" stroke-width="2.4" stroke-linecap="round"/><path d="M15 21l3 2M33 21l-3 2" stroke="#dffd64" stroke-width="2" stroke-linecap="round"/></svg>',
    stamp: '<svg viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="4" stroke="#111" stroke-width="2.4"/><rect x="14" y="14" width="20" height="20" rx="2" stroke="#ff704e" stroke-width="2" stroke-dasharray="3 3"/><path d="M8 40h32" stroke="#111" stroke-width="3"/></svg>',
    tape: '<svg viewBox="0 0 48 48" fill="none"><path d="M12 6h24v36l-4-3-4 3-4-3-4 3-4-3-4 3V6z" fill="#fff" stroke="#111" stroke-width="2.2"/><path d="M17 14h14M17 20h14M17 26h9" stroke="#111" stroke-width="2" stroke-linecap="round"/><path d="M28 32h3" stroke="#ff704e" stroke-width="3" stroke-linecap="round"/></svg>',
    probe: '<svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="14" stroke="#111" stroke-width="2.2"/><path d="M24 4v8M24 36v8M4 24h8M36 24h8" stroke="#2f5bff" stroke-width="2.2" stroke-linecap="round"/><circle cx="24" cy="24" r="3" fill="#ff704e"/></svg>',
    plug: '<svg viewBox="0 0 48 48" fill="none"><path d="M10 24h10M28 24h10" stroke="#111" stroke-width="2.6" stroke-linecap="round"/><rect x="18" y="16" width="12" height="16" rx="3" fill="#111"/><path d="M6 24a4 4 0 108 0 4 4 0 00-8 0zM34 24a4 4 0 108 0 4 4 0 00-8 0z" fill="#2f5bff"/><path d="M22 20v8M26 20v8" stroke="#dffd64" stroke-width="2"/></svg>',
    scan: '<svg viewBox="0 0 48 48" fill="none"><path d="M8 16V8h8M32 8h8v8M40 32v8h-8M16 40H8v-8" stroke="#111" stroke-width="2.4" stroke-linecap="round"/><path d="M10 24h28" stroke="#ff704e" stroke-width="2.2"/></svg>',
    face: '<svg viewBox="0 0 64 64" fill="none"><path d="M8 12c8 6 40 6 48 0v20c0 16-12 24-24 24S8 48 8 32V12z" fill="currentColor"/><path d="M17 27c4-4 9-4 13 0M34 27c4-4 9-4 13 0" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M19 39c6 8 20 8 26 0" stroke="#111" stroke-width="3" stroke-linecap="round"/><path d="M20 28l4 3M44 28l-4 3" stroke="#111" stroke-width="2.6" stroke-linecap="round"/></svg>'
  };

  /* ---------------------------------------------------------------- LOADER */
  if (!reduced) {
    const first = !sessionStorage.getItem('e1Loaded');
    const total = first ? 1500 : 950;
    const loader = document.createElement('div');
    loader.className = 'e1-loader';
    loader.innerHTML = `<div class="e1-loadstage"><canvas></canvas><div class="e1-scanline"></div><div class="e1-lens"></div>
      <div class="e1-loadlog"></div><div class="e1-count">000</div>
      <div class="e1-loadcopy"><strong>EMET ONE</strong><span>${body.dataset.module || 'VERIFICATION INTELLIGENCE'}</span></div></div>`;
    body.prepend(loader);
    body.classList.add('loading');
    const canvas = loader.querySelector('canvas'), ctx = canvas.getContext('2d');
    const log = loader.querySelector('.e1-loadlog'), count = loader.querySelector('.e1-count');
    const lines = (body.dataset.boot || 'READING INPUT|EXTRACTING CLAIMS|CROSS-CHECKING SOURCES|EVIDENCE READY').split('|');
    let raf, shown = 0;
    const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const pts = Array.from({length: 30}, () => ({x: rnd(0, r.width), y: rnd(0, r.height), r: rnd(.5, 2), a: rnd(.12, .45)}));
    const t0 = performance.now();
    const frame = now => {
      const p = clamp((now - t0) / total, 0, 1), e = 1 - Math.pow(1 - p, 3);
      count.textContent = String(Math.round(e * 100)).padStart(3, '0');
      while (shown < lines.length && e > (shown + 1) / (lines.length + 1)) { const l = document.createElement('div'); l.textContent = lines[shown]; log.appendChild(l); shown++; }
      ctx.clearRect(0, 0, r.width, r.height);
      pts.forEach(q => { q.x += .12; q.y += Math.sin(q.x * .02) * .04; if (q.x > r.width + 10) q.x = -10; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fillStyle = `rgba(47,91,255,${q.a})`; ctx.fill(); });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j], dd = Math.hypot(a.x - b.x, a.y - b.y); if (dd < 90) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = `rgba(17,17,17,${(1 - dd / 90) * .07})`; ctx.stroke(); } }
      if (p < 1) raf = requestAnimationFrame(frame);
      else { sessionStorage.setItem('e1Loaded', '1'); loader.classList.add('hide'); body.classList.remove('loading'); body.classList.add('loaded'); setTimeout(() => loader.remove(), 700); }
    };
    raf = requestAnimationFrame(frame);
  } else body.classList.add('loaded');

  /* ------------------------------------------------------------ SPLIT TEXT */
  const splitWords = (el, cls = 'w') => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = cls; w.style.setProperty('--i', i++);
            const inner = document.createElement('span'); inner.textContent = part; w.appendChild(inner); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  };
  document.querySelectorAll('.split').forEach(el => splitWords(el));

  /* ------------------------------------------------------------ REVEALS */
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), {threshold: .12});
  document.querySelectorAll('.reveal,.split').forEach(e => ro.observe(e));

  /* --------------------------------------------------------------- NAV */
  const path = location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('.links a,.mobilePanel a').forEach(a => { const href = a.getAttribute('href'); if (href === path || (path === '/' && href === '/index.html')) a.setAttribute('aria-current', 'page'); });
  const nav = document.querySelector('.nav');
  const progress = document.createElement('i'); progress.className = 'e1-progress'; body.appendChild(progress);
  let lastY = scrollY;
  const scrollFns = [];
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
    document.documentElement.style.setProperty('--sy', y);
    if (nav) nav.classList.toggle('hide', y > 140 && y > lastY && !body.classList.contains('menuOpen'));
    lastY = y;
    scrollFns.forEach(f => f());
  };
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll);

  /* ------------------------------------------------------------- TICKERS */
  document.querySelectorAll('.tickerTrack,.bigMarquee div').forEach(t => { const html = t.innerHTML; t.innerHTML = html + html + html; });

  /* ------------------------------------------------------ ROW STATUSES */
  document.querySelectorAll('.row').forEach(r => {
    const s = (r.querySelector('span:last-child')?.textContent || '').trim().toLowerCase();
    const status = ['confirmed', 'matched', 'conflict', 'review', 'unknown'].find(k => s.includes(k));
    if (status) r.dataset.status = status === 'matched' ? 'confirmed' : status;
  });

  /* ------------------------------------------------ HERO X-RAY LAYERS
     data-xray="phrase|phrase" + data-faces="n": the con behind the copy. */
  document.querySelectorAll('[data-xray]').forEach(host => {
    const layer = document.createElement('div'); layer.className = 'xray heroX'; layer.setAttribute('aria-hidden', 'true');
    const rand = seeded(page.length * 977 + host.dataset.xray.length);
    const phrases = host.dataset.xray.split('|');
    const faces = +(host.dataset.faces || 0);
    let html = '<div class="xgrid">';
    for (let i = 0; i < 190; i++) {
      const p = phrases[i % phrases.length];
      const big = i % 16 === 5;
      html += `<span class="xp${big ? ' big' : ''}" style="--rot:${((rand() - .5) * 6).toFixed(1)}deg;--d:${(rand() * 3).toFixed(2)}s">${p}</span>`;
      if (faces && i % Math.ceil(190 / faces) === 3) html += `<i class="xf" style="--rot:${((rand() - .5) * 30).toFixed(0)}deg;--d:${(rand() * 4).toFixed(2)}s">${ICON.face}</i>`;
    }
    html += `</div><b class="xtag">${host.dataset.xtag || 'UNDER THE SURFACE'}</b>`;
    layer.innerHTML = html; host.appendChild(layer);
  });
  document.querySelectorAll('.xray[data-tokens]').forEach(layer => {
    const words = layer.dataset.tokens.split('|'); const frag = document.createElement('div'); frag.className = 'tokens';
    for (let i = 0; i < 160; i++) { const s = document.createElement('span'); s.textContent = words[i % words.length]; frag.appendChild(s); }
    layer.appendChild(frag);
  });

  /* ---------------------------------------------------- PINNED PROCESS */
  document.querySelectorAll('.pin').forEach(sec => {
    const steps = [...sec.querySelectorAll('.flowStep')], doc = sec.querySelector('.pinDoc'), labels = (doc?.dataset.labels || '').split('|');
    const upd = () => {
      const r = sec.getBoundingClientRect();
      const p = innerWidth <= 1024 ? 1 : clamp(-r.top / (r.height - innerHeight), 0, 1);
      sec.style.setProperty('--p', p);
      const i = Math.min(steps.length - 1, Math.floor(p * steps.length));
      steps.forEach((s, k) => { s.classList.toggle('active', k <= i); s.classList.toggle('now', k === i); });
      if (doc) { doc.style.left = `${p * 100}%`; if (labels[i]) doc.dataset.state = labels[i]; }
    };
    scrollFns.push(upd);
  });

  /* ------------------------------------------- HORIZONTAL PINNED GALLERY */
  document.querySelectorAll('.hscroll').forEach(sec => {
    const track = sec.querySelector('.hsTrack');
    const size = () => { if (innerWidth <= 1024) { sec.style.height = ''; track.style.transform = ''; return; } sec.style.height = `${innerHeight + track.scrollWidth - innerWidth + 200}px`; };
    const upd = () => {
      if (innerWidth <= 1024) return;
      const r = sec.getBoundingClientRect(), p = clamp(-r.top / (r.height - innerHeight), 0, 1);
      track.style.transform = `translate3d(${-(track.scrollWidth - innerWidth + 120) * p}px,0,0)`;
      sec.style.setProperty('--p', p);
    };
    size(); addEventListener('resize', size); scrollFns.push(upd);
  });

  /* ------------------------------------------------- SCROLL-LIT TEXT */
  document.querySelectorAll('.scrollText').forEach(el => {
    splitWords(el, 'lw'); const words = [...el.querySelectorAll('.lw')];
    scrollFns.push(() => { const line = innerHeight * .62; words.forEach(w => w.classList.toggle('lit', w.getBoundingClientRect().top < line)); });
  });

  /* ------------------------------------------------------ REDLINE DIFF */
  document.querySelectorAll('.redlineSec').forEach(sec => {
    const vs = [...sec.querySelectorAll('.rv')], tag = sec.querySelector('.rvTag');
    scrollFns.push(() => {
      const r = sec.getBoundingClientRect(), p = innerWidth <= 1024 ? 1 : clamp(-r.top / (r.height - innerHeight), 0, 1);
      const i = Math.min(vs.length - 1, Math.floor(p * vs.length));
      vs.forEach((v, k) => v.classList.toggle('on', k === i));
      if (tag) tag.textContent = `VERSION ${i + 1} / ${vs.length}`;
    });
  });

  /* ------------------------------------------------------ COMPARE SLIDER */
  document.querySelectorAll('.compare').forEach(c => {
    const handle = c.querySelector('.cmpHandle');
    let p = 50, raf = 0, drag = false, armed = false, pid = null, grab = 0, sx = 0, sy = 0, st = 0;

    /* keep the drag pill fully inside the rounded card on every screen size */
    const limits = () => { const w = c.getBoundingClientRect().width || 1, m = clamp(58 / w * 100, 4, 20); return [m, 100 - m]; };
    const paint = () => { raf = 0; c.style.setProperty('--p', `${p}%`); c.setAttribute('aria-valuenow', Math.round(p)); };
    const setTo = v => { const [a, b] = limits(); p = clamp(v, a, b); if (!raf) raf = requestAnimationFrame(paint); };
    const atX = x => { const r = c.getBoundingClientRect(); return r.width ? (x - r.left) / r.width * 100 : 50; };
    const glide = () => { c.classList.add('smooth'); clearTimeout(st); st = setTimeout(() => c.classList.remove('smooth'), 380); };
    const end = () => { try { if (pid !== null) c.releasePointerCapture(pid); } catch (_) {} drag = armed = false; pid = null; c.classList.remove('dragging'); };

    c.tabIndex = 0;
    c.setAttribute('role', 'slider');
    c.setAttribute('aria-label', 'Drag to compare the issued receipt with the one received in accounting');
    c.setAttribute('aria-valuemin', '0'); c.setAttribute('aria-valuemax', '100');
    setTo(50);

    c.addEventListener('pointerdown', e => {
      if (e.button > 0 || pid !== null) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY;
      const onHandle = handle && (e.target === handle || handle.contains(e.target));
      if (onHandle || e.pointerType === 'mouse') {
        /* grabbing the pill keeps the divider where the finger took it, no jump */
        grab = onHandle ? p - atX(e.clientX) : 0;
        drag = true; c.classList.add('dragging'); c.setPointerCapture(pid);
        if (!onHandle) setTo(atX(e.clientX));
      } else armed = true; /* touch away from the pill: wait and see if this is a scroll */
    });

    c.addEventListener('pointermove', e => {
      if (e.pointerId !== pid) return;
      if (armed) {
        const dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
        if (dy > dx && dy > 6) return end();  /* vertical intent: let the page scroll */
        if (dx < 8) return;
        armed = false; drag = true; grab = 0; c.classList.add('dragging'); c.setPointerCapture(pid);
      }
      if (drag) setTo(atX(e.clientX) + grab);
    });

    c.addEventListener('pointerup', e => { if (e.pointerId !== pid) return; if (armed) { glide(); setTo(atX(e.clientX)); } end(); });
    c.addEventListener('pointercancel', end);
    addEventListener('resize', () => setTo(p));

    c.addEventListener('keydown', e => {
      const step = e.shiftKey ? 12 : 4;
      if (e.key === 'ArrowLeft') setTo(p - step);
      else if (e.key === 'ArrowRight') setTo(p + step);
      else if (e.key === 'Home') { glide(); setTo(0); }
      else if (e.key === 'End') { glide(); setTo(100); }
      else return;
      e.preventDefault();
    });

    if (fine) c.addEventListener('mousemove', e => { if (!drag) setTo(atX(e.clientX)); });
  });

  /* ------------------------------------------------------------ COUNTERS */
  const co = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; co.unobserve(e.target);
    const el = e.target, to = +el.dataset.to, dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 1400;
    const tick = now => { const p = clamp((now - t0) / dur, 0, 1), v = to * (1 - Math.pow(1 - p, 3)); el.textContent = v.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec}); if (p < 1) requestAnimationFrame(tick); else el.classList.add('done'); };
    reduced ? (el.textContent = to.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec})) : requestAnimationFrame(tick);
  }), {threshold: .5});
  document.querySelectorAll('.count').forEach(el => co.observe(el));

  /* --------------------------------------------------------------- GAUGE */
  document.querySelectorAll('.gauge').forEach(g => {
    const arc = g.querySelector('.gArc'), num = g.querySelector('.gNum'), to = +g.dataset.to, len = 2 * Math.PI * 88 * .75;
    arc.style.strokeDasharray = `${len} ${len * 2}`; arc.style.strokeDashoffset = len;
    const io = new IntersectionObserver(es => { if (!es[0].isIntersecting) return; io.disconnect(); const t0 = performance.now();
      const tick = now => { const p = clamp((now - t0) / 1800, 0, 1), e = 1 - Math.pow(1 - p, 4), v = to * e; arc.style.strokeDashoffset = len - len * v / 100; num.textContent = Math.round(v); if (p < 1) requestAnimationFrame(tick); else g.classList.add('done'); };
      reduced ? (arc.style.strokeDashoffset = len - len * to / 100, num.textContent = to) : requestAnimationFrame(tick); }, {threshold: .5});
    io.observe(g);
  });

  /* ------------------------------------------------------------- PLANNER */
  document.querySelectorAll('.planner').forEach(pl => {
    const chips = [...pl.querySelectorAll('.chipBtn')], list = pl.querySelector('.plan'), meter = pl.querySelector('.planMeter i'), note = pl.querySelector('.planNote');
    const render = () => {
      const on = chips.filter(c => c.classList.contains('on'));
      const items = []; on.forEach(c => c.dataset.checks.split('|').forEach(x => { if (!items.includes(x)) items.push(x); }));
      list.innerHTML = items.length ? items.map((x, i) => `<li style="--i:${i}"><b>${String(i + 1).padStart(2, '0')}</b>${x}</li>`).join('') : '<li class="empty">Pick what you were sent. The plan writes itself.</li>';
      const conf = Math.min(92, 34 + items.length * 7);
      if (meter) meter.style.width = `${items.length ? conf : 0}%`;
      if (note) note.textContent = items.length ? `${items.length} checks · confidence ceiling ${conf}%. We never promise the last 8.` : 'Nothing selected. Nothing assumed.';
    };
    chips.forEach(c => c.addEventListener('click', () => { c.classList.toggle('on'); render(); }));
    render();
  });

  /* ---------------------------------------------------- PROXIMITY TILES */
  const prox = [...document.querySelectorAll('.prox .tile')];
  if (prox.length && fine) addEventListener('mousemove', e => {
    prox.forEach(t => { const r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return; const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); t.style.setProperty('--d', clamp(1 - d / 320, 0, 1).toFixed(3)); t.style.setProperty('--mx', `${e.clientX - r.left}px`); t.style.setProperty('--my', `${e.clientY - r.top}px`); });
  }, {passive: true});

  /* ---------------------------------------------- HOVER MICRO-INTERACTIONS */
  const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/<>';
  const scramble = (el, src, speed = 34) => { let n = 0; clearInterval(el._t); el._t = setInterval(() => { n++; el.textContent = src.split('').map((ch, i) => ch === ' ' || i < n * 2 ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]).join(''); if (n * 2 >= src.length) { clearInterval(el._t); el.textContent = src; } }, speed); };
  if (fine && !reduced) {
    document.querySelectorAll('.btn,.navcta').forEach(b => {
      b.classList.add('magnetic');
      b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .3}px,${(e.clientY - r.top - r.height / 2) * .4}px)`; });
      b.addEventListener('mouseleave', () => b.style.transform = '');
    });
    document.querySelectorAll('.eyebrow,.card .mono,.chip,.foot span,.stageTag,.flowStep b,.flags .flag b').forEach(el => { const src = el.textContent; el.addEventListener('mouseenter', () => scramble(el, src)); });
    document.querySelectorAll('.dict .say').forEach(row => { const mean = row.parentElement.querySelector('.mean'), src = mean.textContent; row.parentElement.addEventListener('mouseenter', () => scramble(mean, src, 22)); });
    document.querySelectorAll('.tilt').forEach(el => {
      el.addEventListener('mousemove', e => { const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height; el.style.setProperty('--rx', `${(py - .5) * -8}deg`); el.style.setProperty('--ry', `${(px - .5) * 10}deg`); el.style.setProperty('--gx', `${px * 100}%`); el.style.setProperty('--gy', `${py * 100}%`); });
      el.addEventListener('mouseleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ---------------------------------------------------------- WEBGL WARP
     A domain-warped noise field behind the fraud graph. Skips when unsupported. */
  document.querySelectorAll('[data-gl]').forEach(host => {
    if (reduced) return;
    const c = document.createElement('canvas'); c.className = 'glbg'; host.prepend(c);
    const gl = c.getContext('webgl', {antialias: false, alpha: true}); if (!gl) { c.remove(); return; }
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = `precision mediump float;uniform vec2 r;uniform float t;uniform vec2 m;
      vec2 h(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453123);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(dot(h(i),f),dot(h(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(h(i+vec2(0,1)),f-vec2(0,1)),dot(h(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
      void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=uv*3.;p.x*=r.x/r.y;float d=length(uv-m);
        vec2 q=vec2(fbm(p+t*.06),fbm(p+vec2(5.2,1.3)-t*.05));vec2 w=vec2(fbm(p+4.*q+vec2(1.7,9.2)+t*.08),fbm(p+4.*q+vec2(8.3,2.8)));
        float f=fbm(p+4.*w-smoothstep(.5,0.,d)*1.2);
        vec3 cream=vec3(.965,.953,.925),blue=vec3(.184,.357,1.),orange=vec3(1.,.44,.306),lime=vec3(.875,.99,.39);
        vec3 col=mix(cream,blue,smoothstep(.35,.75,f)*.28);col=mix(col,orange,smoothstep(.55,.9,w.x)*.18);col=mix(col,lime,smoothstep(.6,.95,q.y)*.22);
        col=mix(col,vec3(.07),smoothstep(.22,0.,d)*.35);
        gl_FragColor=vec4(col,.9);}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { c.remove(); return; }
    host.dataset.gl = 'on'; gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't'), um = gl.getUniformLocation(pr, 'm');
    let mx = .5, my = .5, tx = .5, ty = .5, live = false, raf = 0;
    const size = () => { const r = host.getBoundingClientRect(); c.width = Math.max(1, r.width / 2); c.height = Math.max(1, r.height / 2); gl.viewport(0, 0, c.width, c.height); };
    size(); addEventListener('resize', size);
    host.addEventListener('mousemove', e => { const r = host.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width; ty = 1 - (e.clientY - r.top) / r.height; });
    const draw = t => { if (!live) { raf = 0; return; } mx = lerp(mx, tx, .06); my = lerp(my, ty, .06); gl.uniform2f(ur, c.width, c.height); gl.uniform1f(ut, t / 1000); gl.uniform2f(um, mx, my); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); raf = requestAnimationFrame(draw); };
    new IntersectionObserver(es => { live = es[0].isIntersecting; if (live && !raf) raf = requestAnimationFrame(draw); }).observe(host);
  });

  /* --------------------------------------------------------- HERO SCENES */
  const mouse = {x: innerWidth / 2, y: innerHeight / 2};
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, {passive: true});
  const mkCanvas = host => {
    const c = document.createElement('canvas'); host.appendChild(c); const ctx = c.getContext('2d'); const s = {c, ctx, w: 0, h: 0};
    const size = () => { const r = host.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); s.w = r.width; s.h = r.height; c.width = r.width * d; c.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size); return s;
  };
  const runScene = (host, draw) => {
    let live = false, raf;
    const loop = t => { if (!live || reduced) { raf = 0; return; } draw(t); raf = requestAnimationFrame(loop); };
    new IntersectionObserver(es => { live = es[0].isIntersecting; if (live && !raf) loop(performance.now()); }).observe(host);
    if (reduced) draw(0);
  };
  const local = host => { const r = host.getBoundingClientRect(); return {x: mouse.x - r.left, y: mouse.y - r.top, in: mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom}; };

  const scenes = {
    graph(host) {
      const s = mkCanvas(host);
      const labels = ['CLAIM', 'INVOICE', 'DATE', 'IDENTITY', 'PAYMENT', 'EMAIL', 'DOMAIN', 'SIGNATURE', 'ADDRESS', 'COMPANY', 'TIMELINE', 'AMOUNT'];
      const nodes = labels.map(l => ({l, x: rnd(.12, .88), y: rnd(.1, .7), vx: rnd(-.0004, .0004), vy: rnd(-.0004, .0004), r: rnd(3, 5)}));
      const edges = [];
      nodes.forEach((n, i) => { nodes.map((m, j) => ({j, d: Math.hypot(n.x - m.x, n.y - m.y)})).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2).forEach(o => { if (!edges.some(e => (e.a === i && e.b === o.j) || (e.a === o.j && e.b === i))) edges.push({a: i, b: o.j}); }); });
      edges[2].broken = true; edges[6].conflict = true;
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host); ctx.clearRect(0, 0, w, h); let hov = -1;
        nodes.forEach((n, i) => { n.x += n.vx; n.y += n.vy; if (n.x < .08 || n.x > .92) n.vx *= -1; if (n.y < .08 || n.y > .72) n.vy *= -1; const px = n.x * w, py = n.y * h; if (m.in) { const dx = px - m.x, dy = py - m.y, d = Math.hypot(dx, dy); if (d < 110 && d > 0) { n.x += dx / d * .0012; n.y += dy / d * .0012; } if (d < 26) hov = i; } });
        edges.forEach(e => { const a = nodes[e.a], b = nodes[e.b], hi = hov === e.a || hov === e.b; ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.setLineDash(e.broken ? [4, 6] : []); ctx.lineDashOffset = -t / 40; ctx.strokeStyle = e.broken ? `rgba(255,112,78,${.6 + Math.sin(t / 180) * .3})` : e.conflict ? 'rgba(197,138,0,.8)' : hi ? 'rgba(47,91,255,.8)' : 'rgba(17,17,17,.16)'; ctx.lineWidth = hi || e.broken ? 1.6 : 1; ctx.stroke(); ctx.setLineDash([]); if (e.broken) { ctx.fillStyle = '#ff704e'; ctx.font = MONO; ctx.fillText('CHAIN BREAK', (a.x + b.x) / 2 * w + 8, (a.y + b.y) / 2 * h - 6); } });
        nodes.forEach((n, i) => { const px = n.x * w, py = n.y * h, hi = hov === i; ctx.beginPath(); ctx.arc(px, py, hi ? n.r + 3 : n.r, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#111'; ctx.fill(); if (hi) { ctx.beginPath(); ctx.arc(px, py, n.r + 10, 0, 7); ctx.strokeStyle = 'rgba(47,91,255,.4)'; ctx.stroke(); } ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.65)'; ctx.font = MONO; ctx.fillText(hi ? n.l + ' · SUSPECT' : n.l, px + 9, py + 3); });
        ctx.fillStyle = 'rgba(17,17,17,.55)'; ctx.font = MONO; ctx.fillText(`STORY GRAPH · ${nodes.length} CLAIMS · 1 BREAK · 1 CONFLICT · PUSH THEM`, 18, h - 18);
      });
    },
    orbit(host) {
      const s = mkCanvas(host);
      const src = [['REGISTRY', 0], ['COURTS', 0], ['PAYMENTS', 1], ['ACCOUNTING', 1], ['EMAIL', 1], ['CLOUD', 2], ['WEB', 2], ['API', 2]];
      const rings = [.18, .28, .38]; const nodes = src.map(([l, ring], i) => ({l, ring, a: i * 1.3, sp: [.00045, -.0003, .0002][ring]})); const pulses = nodes.map(() => Math.random());
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host), cx = w / 2, cy = h * .44, R = Math.min(w, h); ctx.clearRect(0, 0, w, h); const tilt = m.in ? (m.x - cx) / w : 0;
        rings.forEach(r => { ctx.beginPath(); ctx.ellipse(cx, cy, r * R, r * R * (.92 - Math.abs(tilt) * .25), 0, 0, 7); ctx.strokeStyle = 'rgba(17,17,17,.1)'; ctx.stroke(); });
        let near = -1, nd = 40;
        nodes.forEach((n, i) => { n.a += n.sp * (1 + tilt * 2 * (n.ring % 2 ? -1 : 1)) * 16; const r = rings[n.ring] * R; n.x = cx + Math.cos(n.a) * r; n.y = cy + Math.sin(n.a) * r * (.92 - Math.abs(tilt) * .25); if (m.in) { const d = Math.hypot(n.x - m.x, n.y - m.y); if (d < nd) { nd = d; near = i; } } });
        nodes.forEach((n, i) => { const hi = near === i; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.strokeStyle = hi ? 'rgba(47,91,255,.7)' : 'rgba(17,17,17,.12)'; ctx.lineWidth = hi ? 1.5 : 1; ctx.stroke(); pulses[i] = (pulses[i] + (hi ? .02 : .006)) % 1; ctx.beginPath(); ctx.arc(lerp(n.x, cx, pulses[i]), lerp(n.y, cy, pulses[i]), 2.2, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#ff704e'; ctx.fill(); ctx.beginPath(); ctx.arc(n.x, n.y, hi ? 7 : 5, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#fffdfa'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke(); ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.65)'; ctx.font = MONO; ctx.fillText(hi ? n.l + ' · CONNECTED' : n.l, n.x + 10, n.y + 3); });
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fillStyle = '#111'; ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy, 34 + Math.sin(t / 300) * 3, 0, 7); ctx.strokeStyle = 'rgba(47,91,255,.35)'; ctx.stroke();
        ctx.fillStyle = '#dffd64'; ctx.font = '800 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('E1', cx, cy + 4); ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(17,17,17,.55)'; ctx.font = MONO; ctx.fillText('SOURCE MESH · 8 CONNECTED · NOTHING WITHOUT PERMISSION', 18, h - 18);
      });
    },
    pipeline(host) {
      const s = mkCanvas(host); const stages = ['INGEST', 'EXTRACT', 'CROSS CHECK', 'EXPLAIN'];
      const parts = Array.from({length: 14}, (_, i) => ({p: i / 14, y: rnd(.3, .7), v: rnd(.0009, .0016), c: 0})); const col = ['#8b867e', '#2f5bff', '#0f8a4b', '#ff704e'];
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host); ctx.clearRect(0, 0, w, h); const pad = 34, gap = (w - pad * 2) / 4, top = h * .3, bh = h * .4;
        stages.forEach((l, i) => { const x = pad + i * gap + 8, bw = gap - 16, hi = m.in && m.x > x && m.x < x + bw; ctx.beginPath(); ctx.roundRect(x, top, bw, bh, 14); ctx.fillStyle = hi ? 'rgba(47,91,255,.08)' : 'rgba(255,255,255,.7)'; ctx.strokeStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.16)'; ctx.fill(); ctx.stroke(); ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.5)'; ctx.font = MONO; ctx.fillText(`0${i + 1}`, x + 12, top + 18); ctx.fillStyle = '#111'; ctx.font = '700 12px Inter, sans-serif'; ctx.fillText(l, x + 12, top + bh - 14); if (i < 3) { ctx.beginPath(); ctx.moveTo(x + bw, top + bh / 2); ctx.lineTo(x + bw + 16, top + bh / 2); ctx.strokeStyle = 'rgba(17,17,17,.3)'; ctx.stroke(); } });
        parts.forEach(q => { q.p += q.v; if (q.p > 1.02) { q.p = -.02; q.c = 0; q.y = rnd(.3, .7); } const stage = Math.floor(clamp(q.p, 0, .999) * 4); if (stage >= 1 && q.c === 0) q.c = 1; if (stage >= 2 && q.c === 1) q.c = Math.random() < .3 ? 3 : 2; ctx.beginPath(); ctx.roundRect(pad + q.p * (w - pad * 2) - 5, top + q.y * bh - 6, 10, 12, 2); ctx.fillStyle = col[q.c]; ctx.fill(); });
        ctx.fillStyle = 'rgba(17,17,17,.55)'; ctx.font = MONO; ctx.fillText('PIPELINE · GREY FILE → BLUE CLAIMS → GREEN CONFIRMED / ORANGE CONFLICT', 18, h - 18);
      });
    },
    console(host) {
      const pre = document.createElement('div'); pre.className = 'console'; host.appendChild(pre);
      const cases = [
        ['> intake receipt_0412.pdf', ['merchant', 'ok', 'matched · registry'], ['total', 'bad', '1,284.00 ≠ 1,248.00'], ['date', 'unk', 'not verifiable'], ['payment', 'ok', 'processor record']],
        ['> intake contract_v3.docx', ['dates', 'ok', 'match email thread'], ['company no.', 'bad', 'differs from registry'], ['signature', 'warn', 'image reused'], ['payment claim', 'unk', 'no evidence']],
        ['> intake message.eml', ['sender domain', 'bad', 'registered 3 days ago'], ['identity', 'warn', 'name ≠ org record'], ['timeline', 'bad', 'impossible sequence'], ['attachment', 'ok', 'hash known']]
      ];
      const labels = {ok: '✓', bad: '✕', warn: '!', unk: '?'}; let ci = 0, li = 0, ch = 0, lineEl;
      const step = () => {
        if (reduced) { pre.innerHTML = cases.map(c => `<div class="cl">${c[0]}</div>` + c.slice(1).map(l => `<div class="cl s-${l[1]}"><span>${l[0]}</span><b>${labels[l[1]]}</b><em>${l[2]}</em></div>`).join('')).join(''); return; }
        const c = cases[ci]; if (li === 0 && ch === 0) pre.innerHTML = '';
        if (li === 0) { if (!lineEl) { lineEl = document.createElement('div'); lineEl.className = 'cl typing'; pre.appendChild(lineEl); } lineEl.textContent = c[0].slice(0, ++ch); if (ch >= c[0].length) { lineEl.classList.remove('typing'); lineEl = null; li++; ch = 0; setTimeout(step, 320); return; } setTimeout(step, 38); return; }
        const l = c[li]; const el = document.createElement('div'); el.className = `cl s-${l[1]}`; el.innerHTML = `<span>${l[0]}</span><b>${labels[l[1]]}</b><em>${l[2]}</em>`; pre.appendChild(el); li++;
        if (li >= c.length) { ci = (ci + 1) % cases.length; li = 0; ch = 0; setTimeout(step, 2200); return; } setTimeout(step, 420);
      };
      step();
    },
    receipt(host) {
      const el = document.createElement('div'); el.className = 'receipt'; host.appendChild(el);
      const items = [['Coffee beans 1kg', 42.00], ['Grinder service', 120.00], ['Delivery', 18.00], ['Filters ×3', 24.00]];
      const sub = items.reduce((a, b) => a + b[1], 0), tax = +(sub * .17).toFixed(2), real = +(sub + tax).toFixed(2), fake = real + 36;
      const money = n => n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      el.innerHTML = `<div class="rHead"><b>NORTH ROAST LTD</b><span>INV-20418 · 03.04.2026</span></div>${items.map(i => `<div class="rRow"><span>${i[0]}</span><span>${money(i[1])}</span></div>`).join('')}<div class="rRow sub"><span>Subtotal</span><span>${money(sub)}</span></div><div class="rRow"><span>VAT 17%</span><span>${money(tax)}</span></div><div class="rRow total"><span>TOTAL</span><span class="rTotal">${money(fake)}</span></div><div class="rScan"></div><div class="rStamp">RECALCULATED ✓</div><div class="rFlag">+36.00 FROM NOWHERE</div>`;
      const total = el.querySelector('.rTotal'); if (reduced) { total.textContent = money(real); el.classList.add('done'); return; }
      const cycle = () => { el.classList.remove('done', 'scan', 'flag'); total.textContent = money(fake); setTimeout(() => el.classList.add('scan'), 500); setTimeout(() => el.classList.add('flag'), 1500); setTimeout(() => { let n = 0; const iv = setInterval(() => { n++; total.textContent = n < 12 ? money(rnd(real - 40, real + 40)) : money(real); if (n >= 12) { clearInterval(iv); el.classList.add('done'); } }, 55); }, 2300); setTimeout(cycle, 5600); };
      cycle();
    },
    pages(host) {
      const el = document.createElement('div'); el.className = 'pages'; host.appendChild(el);
      const notes = [['§2.1 DATE ≠ EMAIL THREAD', 'bad', 22, 30], ['REG. NO. MATCHES REGISTRY', 'ok', 46, 62], ['§7 SIGNATURE IMAGE REUSED', 'warn', 70, 40]];
      el.innerHTML = `<div class="pg p3"></div><div class="pg p2"></div><div class="pg p1"><div class="pgTitle">SERVICE AGREEMENT</div>${Array.from({length: 11}, (_, i) => `<div class="pgLine ${[2, 5, 8].includes(i) ? 'redact' : ''}" style="width:${[92, 78, 88, 60, 90, 84, 70, 92, 66, 88, 50][i]}%"></div>`).join('')}<div class="pgSig"></div>${notes.map(n => `<div class="pgNote s-${n[1]}" style="top:${n[2]}%;left:${n[3]}%"><i></i>${n[0]}</div>`).join('')}</div>`;
      const ns = [...el.querySelectorAll('.pgNote')]; if (reduced) { ns.forEach(n => n.classList.add('on')); return; }
      let k = 0; setInterval(() => { ns.forEach((n, i) => n.classList.toggle('on', i <= k % (ns.length + 1) - 1)); k++; }, 1300);
    }
  };
  document.querySelectorAll('[data-visual]').forEach(host => scenes[host.dataset.visual]?.(host));

  /* ----------------------------------------------------------- CURSOR
     One cursor, one identity per page (body[data-cursor]) and per zone. */
  const xrays = [...document.querySelectorAll('.xray')];
  const setXray = (layer, cx, cy) => { const r = layer.getBoundingClientRect(); layer.style.setProperty('--x', `${cx - r.left}px`); layer.style.setProperty('--y', `${cy - r.top}px`); };
  const hideXray = layer => { layer.style.setProperty('--x', '-999px'); layer.style.setProperty('--y', '-999px'); };

  if (fine && !reduced) {
    document.documentElement.classList.add('e1-cur');
    const cur = document.createElement('div'); cur.className = 'e1-cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<i class="cx"></i><i class="cy"></i><div class="c-ring"><i class="c-orb"></i><i class="c-orb"></i><i class="c-orb"></i></div><div class="c-lens"><div class="c-glass"></div></div><i class="c-handle"></i><i class="c-icon"></i><div class="c-label"></div>';
    const dot = document.createElement('i'); dot.className = 'e1-dot';
    const cable = document.createElement('canvas'); cable.className = 'e1-cable';
    body.append(cur, dot, cable);
    const label = cur.querySelector('.c-label'), icon = cur.querySelector('.c-icon');
    const MODES = ['lens', 'inspect', 'scan', 'link', 'verdict', 'ledger', 'xray', 'mask', 'stamp', 'tape', 'probe', 'plug'];
    let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, shown = false, mode = '', hov = null, zone = null, rvZone = null, timer = 0, stampN = 0;
    const pad = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    const say = (text, status) => { label.className = 'c-label' + (text ? ' show' : '') + (status ? ' s-' + status : ''); if (text) label.textContent = text; };
    const setMode = m => {
      if (m === mode) return; clearInterval(timer);
      MODES.forEach(k => { cur.classList.toggle('m-' + k, k === m); dot.classList.toggle('m-' + k, k === m); });
      icon.innerHTML = ICON[m] || ''; mode = m; hov = undefined; say('');
      if (m === 'mask') { let i = 0; const lines = ['TRUST ME', 'LIAR?', 'IT\'S URGENT', 'PROVE IT', 'JUST THIS ONCE', 'SHOW ME']; timer = setInterval(() => { if (!hov) say(lines[i++ % lines.length]); }, 900); }
      if (m === 'probe') { let i = 0; const lines = ['READING', 'EXTRACTING', 'MATCHING', 'EXPLAINING']; timer = setInterval(() => { if (!hov) say(lines[i++ % lines.length] + '…'); }, 700); }
    };
    const ledger = () => { clearInterval(timer); let n = 0; timer = setInterval(() => { n++; if (n > 9) { clearInterval(timer); say('Σ MATCH ✓', 'confirmed'); return; } say('Σ ' + rnd(100, 9000).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }, 70); };
    const tapeLines = ['COFFEE 42.00', 'VAT 17% 34.68', 'DELIVERY 18.00', 'TOTAL 238.68', 'PAID 274.68 ?', 'DIFF +36.00', 'REFUND 0.00', 'FILTERS 24.00'];
    let tapeN = 0, tapeT = 0;
    const route = e => {
      const t = e.target instanceof Element ? e.target : body;
      const z = t.closest('[data-cursor]');
      const m = z?.dataset.cursor || '';
      if (z !== zone) { if (zone) zone.querySelectorAll('.xray').forEach(hideXray); zone = z; }
      setMode(m);
      cur.classList.toggle('wide', !!t.closest('.visual'));
      const rz = t.closest('[data-xray]');
      if (rz !== rvZone) { if (rvZone) rvZone.querySelectorAll('.heroX').forEach(hideXray); rvZone = rz; }
      cur.classList.toggle('rv', !!rz);
      const h = t.closest('a,button,.card,.row,.integration,.flowStep,.chip,.panel,.stage,.tile,.hsCard,.dictRow,.flags .flag,.stackCard,.exhibit,.faq summary');
      if (h !== hov) {
        hov = h; cur.classList.toggle('hov', !!h);
        if (m === 'inspect') say(h?.matches('.card') ? (h.matches('a') ? 'OPEN CASE ↗' : 'INSPECT') : h ? 'OPEN ↗' : '');
        else if (m === 'link' || m === 'plug') say(h?.matches('.integration,.tile') ? 'LINK SOURCE' : h ? 'OPEN ↗' : 'CONNECT');
        else if (m === 'verdict') { const s = h?.dataset.status; say(s ? s : h ? 'EVIDENCE' : 'REVIEW', s); }
        else if (m === 'ledger') { if (h?.matches('.card')) ledger(); else { clearInterval(timer); say('Σ RECALC'); } }
        else if (m === 'mask') say(h ? (h.matches('.stage') ? 'PUSH THE NODES' : h.matches('.dictRow') ? 'DECODE' : h.matches('.hsCard,.flags .flag,.stackCard') ? 'SUSPECT' : 'OPEN ↗') : 'TRUST ME');
        else if (m === 'stamp') say(h ? (h.matches('.exhibit') ? 'CLICK TO STAMP' : 'OPEN ↗') : 'STAMP IT');
        else if (m === 'tape') say(h ? (h.matches('.card') ? 'RECOUNT' : 'OPEN ↗') : '');
        else if (m === 'probe') say(h ? (h.matches('.chipBtn') ? 'ADD TO CASE' : 'OPEN ↗') : 'SCANNING…');
        else if (m === 'lens') say(h?.matches('.stage,.visual') ? 'INTERACT' : h ? 'OPEN ↗' : '');
        else say(h ? 'OPEN ↗' : '');
      }
      if (m === 'scan') say(`X ${pad(e.clientX)} · Y ${pad(e.clientY)}${h?.matches('.flowStep,.stackCard') ? ' · STEP ' + (h.querySelector('b')?.textContent || '') : ''}`);
      if (m === 'tape' && !hov && performance.now() - tapeT > 140) { tapeT = performance.now(); say(tapeLines[tapeN++ % tapeLines.length]); }
    };
    addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY; x = tx; y = ty;
      dot.style.transform = `translate3d(${tx}px,${ty}px,0)`; cur.style.transform = `translate3d(${tx}px,${ty}px,0)`;
      if (!shown) { shown = true; cur.classList.add('on'); dot.classList.add('on'); }
      route(e);
      if (zone) zone.querySelectorAll('.xray').forEach(l => setXray(l, tx, ty));
      if (rvZone) rvZone.querySelectorAll('.heroX').forEach(l => setXray(l, tx, ty));
    }, {passive: true});
    document.addEventListener('mouseleave', () => { shown = false; cur.classList.remove('on'); dot.classList.remove('on'); });
    addEventListener('mousedown', () => cur.classList.add('down'));
    addEventListener('mouseup', () => cur.classList.remove('down'));
    // Stamp mode: clicking an exhibit leaves a mark.
    addEventListener('click', e => {
      if (mode !== 'stamp') return; const ex = e.target.closest('.exhibit,.stampable'); if (!ex) return;
      const r = ex.getBoundingClientRect(); const mk = document.createElement('b'); mk.className = 'stampMark ' + (stampN++ % 2 ? 'disputed' : 'verified'); mk.textContent = stampN % 2 ? 'VERIFIED' : 'DISPUTED';
      mk.style.left = `${e.clientX - r.left}px`; mk.style.top = `${e.clientY - r.top}px`; mk.style.setProperty('--rot', `${rnd(-18, 18)}deg`); ex.appendChild(mk); cur.classList.add('thud'); setTimeout(() => cur.classList.remove('thud'), 300);
    });
    // Plug mode: a cable from the cursor to the nearest tile.
    const cctx = cable.getContext('2d');
    const sizeCable = () => { cable.width = innerWidth; cable.height = innerHeight; }; sizeCable(); addEventListener('resize', sizeCable);
    addEventListener('scroll', () => { if (zone) zone.querySelectorAll('.xray').forEach(l => setXray(l, tx, ty)); if (rvZone) rvZone.querySelectorAll('.heroX').forEach(l => setXray(l, tx, ty)); }, {passive: true});
    (function loop() {
      if (mode === 'plug') {
        cctx.clearRect(0, 0, cable.width, cable.height); let best = null, bd = 260;
        prox.forEach(t => { const r = t.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(cx - x, cy - y); if (d < bd) { bd = d; best = {cx, cy}; } });
        if (best) { cctx.beginPath(); cctx.moveTo(x, y); cctx.bezierCurveTo(x, y + 80, best.cx, best.cy - 80, best.cx, best.cy); cctx.strokeStyle = 'rgba(47,91,255,.8)'; cctx.lineWidth = 2; cctx.setLineDash([6, 6]); cctx.lineDashOffset = -performance.now() / 30; cctx.stroke(); cctx.setLineDash([]); cctx.beginPath(); cctx.arc(best.cx, best.cy, 5, 0, 7); cctx.fillStyle = '#2f5bff'; cctx.fill(); }
        cable.classList.add('on');
      } else if (cable.classList.contains('on')) { cctx.clearRect(0, 0, cable.width, cable.height); cable.classList.remove('on'); }
      requestAnimationFrame(loop);
    })();
  } else if (!reduced && xrays.length) {
    const live = new Set(); const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? live.add(e.target) : live.delete(e.target)));
    xrays.forEach(l => { l.style.setProperty('--r', '170px'); io.observe(l); });
    (function drift(t) { live.forEach(l => { const w = l.offsetWidth, h = l.offsetHeight, k = t / 1000; l.style.setProperty('--x', `${w / 2 + Math.sin(k * .6) * w * .38}px`); l.style.setProperty('--y', `${h / 2 + Math.cos(k * .45) * h * .32}px`); }); requestAnimationFrame(drift); })(0);
  }

  /* ------------------------------------------------------- MOBILE MENU */
  const btn = document.querySelector('.mobileBtn'), panel = document.querySelector('.mobilePanel');
  if (btn && !btn.querySelector('span')) btn.innerHTML = '<span></span>';
  let backdrop = document.querySelector('.menuBackdrop'); if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'menuBackdrop'; body.appendChild(backdrop); }
  const setMenu = open => { btn?.classList.toggle('open', open); panel?.classList.toggle('open', open); backdrop.classList.toggle('open', open); body.classList.toggle('menuOpen', open); nav?.classList.remove('hide'); btn?.setAttribute('aria-expanded', open ? 'true' : 'false'); if (innerWidth <= 760) body.style.overflow = open ? 'hidden' : ''; };
  btn?.addEventListener('click', () => setMenu(!panel?.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  panel?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('resize', () => { if (innerWidth > 760) setMenu(false); });

  /* --------------------------------------------------- PAGE TRANSITION
     Cross-document View Transitions where supported; a clip-path veil elsewhere. */
  if (!reduced && !CSS.supports('view-transition-name: x')) {
    const veil = document.createElement('div'); veil.className = 'e1-transition'; body.appendChild(veil);
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href'); if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || a.target === '_blank') return;
      a.addEventListener('click', e => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); const r = a.getBoundingClientRect(); veil.style.setProperty('--tx', `${r.left + r.width / 2}px`); veil.style.setProperty('--ty', `${r.top + r.height / 2}px`); veil.classList.add('go'); setTimeout(() => location.href = href, 300); });
    });
  }
  onScroll();
})();
