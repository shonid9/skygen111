(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const body = document.body;
  const page = body.dataset.page || 'home';
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MONO = '500 9px "IBM Plex Mono", monospace';

  /* ---------------------------------------------------------------- LOADER
     A short "verification boot" on every page: counter, log lines, scanline,
     then a curtain wipe. Shorter after the first visit in the tab. */
  if (!reduced) {
    const first = !sessionStorage.getItem('e1Loaded');
    const total = first ? 1500 : 1000;
    const loader = document.createElement('div');
    loader.className = 'e1-loader';
    loader.innerHTML = `<div class="e1-loadstage"><canvas></canvas><div class="e1-scanline"></div><div class="e1-lens"></div>
      <div class="e1-loadlog"></div><div class="e1-count">000</div>
      <div class="e1-loadcopy"><strong>EMET ONE</strong><span>${body.dataset.module || 'VERIFICATION INTELLIGENCE'}</span></div></div>`;
    body.prepend(loader);
    body.classList.add('loading');
    const canvas = loader.querySelector('canvas'), ctx = canvas.getContext('2d');
    const log = loader.querySelector('.e1-loadlog'), count = loader.querySelector('.e1-count');
    const lines = ['READING INPUT', 'EXTRACTING CLAIMS', 'CROSS-CHECKING SOURCES', 'EVIDENCE READY'];
    let raf, shown = 0;
    const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
    canvas.width = r.width * d; canvas.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    const pts = Array.from({length: 30}, () => ({x: rnd(0, r.width), y: rnd(0, r.height), r: rnd(.5, 2), a: rnd(.12, .45)}));
    const t0 = performance.now();
    const frame = now => {
      const p = clamp((now - t0) / total, 0, 1), e = 1 - Math.pow(1 - p, 3);
      count.textContent = String(Math.round(e * 100)).padStart(3, '0');
      while (shown < lines.length && e > (shown + 1) / (lines.length + 1)) {
        const l = document.createElement('div'); l.textContent = lines[shown]; log.appendChild(l); shown++;
      }
      ctx.clearRect(0, 0, r.width, r.height);
      pts.forEach(q => { q.x += .12; q.y += Math.sin(q.x * .02) * .04; if (q.x > r.width + 10) q.x = -10; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fillStyle = `rgba(47,91,255,${q.a})`; ctx.fill(); });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const a = pts[i], b = pts[j], dd = Math.hypot(a.x - b.x, a.y - b.y); if (dd < 90) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = `rgba(17,17,17,${(1 - dd / 90) * .07})`; ctx.stroke(); } }
      if (p < 1) raf = requestAnimationFrame(frame);
      else { sessionStorage.setItem('e1Loaded', '1'); loader.classList.add('hide'); body.classList.remove('loading'); body.classList.add('loaded'); setTimeout(() => loader.remove(), 700); }
    };
    raf = requestAnimationFrame(frame);
  } else body.classList.add('loaded');

  /* ------------------------------------------------------------ SPLIT TEXT
     Headlines animate word by word. Keeps <br> and coloured <span>s intact. */
  const splitWords = el => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', i++);
            const inner = document.createElement('span'); inner.textContent = part; w.appendChild(inner); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
  };
  document.querySelectorAll('.split').forEach(splitWords);

  /* ------------------------------------------------------------ REVEALS */
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), {threshold: .12});
  document.querySelectorAll('.reveal,.split').forEach(e => ro.observe(e));

  /* --------------------------------------------------------------- NAV */
  const path = location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('.links a,.mobilePanel a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '/' && href === '/index.html')) a.setAttribute('aria-current', 'page');
  });
  const nav = document.querySelector('.nav');
  const progress = document.createElement('i'); progress.className = 'e1-progress'; body.appendChild(progress);
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
    document.documentElement.style.setProperty('--sy', y);
    if (nav) nav.classList.toggle('hide', y > 140 && y > lastY && !body.classList.contains('menuOpen'));
    lastY = y;
  };
  addEventListener('scroll', onScroll, {passive: true}); addEventListener('resize', onScroll); onScroll();

  /* ------------------------------------------------------------- TICKER */
  document.querySelectorAll('.tickerTrack').forEach(t => { const html = t.innerHTML; t.innerHTML = html + html + html; });

  /* ------------------------------------------------------ ROW STATUSES */
  document.querySelectorAll('.row').forEach(r => {
    const s = (r.querySelector('span:last-child')?.textContent || '').trim().toLowerCase();
    const status = ['confirmed', 'matched', 'conflict', 'review', 'unknown'].find(k => s.includes(k));
    if (status) r.dataset.status = status === 'matched' ? 'confirmed' : status;
  });

  /* ---------------------------------------------------- PINNED PROCESS */
  document.querySelectorAll('.pin').forEach(sec => {
    const steps = [...sec.querySelectorAll('.flowStep')];
    const doc = sec.querySelector('.pinDoc');
    const labels = (doc?.dataset.labels || '').split('|');
    const upd = () => {
      const r = sec.getBoundingClientRect();
      const p = innerWidth <= 760 ? 1 : clamp(-r.top / (r.height - innerHeight), 0, 1);
      sec.style.setProperty('--p', p);
      const i = Math.min(steps.length - 1, Math.floor(p * steps.length));
      steps.forEach((s, k) => { s.classList.toggle('active', k <= i); s.classList.toggle('now', k === i); });
      if (doc) { doc.style.left = `${p * 100}%`; if (labels[i]) doc.dataset.state = labels[i]; }
    };
    addEventListener('scroll', upd, {passive: true}); addEventListener('resize', upd); upd();
  });

  /* ---------------------------------------------- HOVER MICRO-INTERACTIONS */
  if (fine && !reduced) {
    // Magnetic buttons
    document.querySelectorAll('.btn,.navcta').forEach(b => {
      b.classList.add('magnetic');
      b.addEventListener('mousemove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .3}px,${(e.clientY - r.top - r.height / 2) * .4}px)`; });
      b.addEventListener('mouseleave', () => b.style.transform = '');
    });
    // Decode / scramble on mono labels
    const glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#/<>';
    document.querySelectorAll('.eyebrow,.card .mono,.chip,.foot span,.stageTag,.flowStep b').forEach(el => {
      const src = el.textContent; let timer;
      el.addEventListener('mouseenter', () => {
        clearInterval(timer); let n = 0;
        timer = setInterval(() => {
          n++;
          el.textContent = src.split('').map((ch, i) => ch === ' ' || i < n * 2 ? ch : glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
          if (n * 2 >= src.length) { clearInterval(timer); el.textContent = src; }
        }, 34);
      });
    });
    // 3D tilt with a glare that follows the pointer
    document.querySelectorAll('.tilt').forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${(py - .5) * -8}deg`); el.style.setProperty('--ry', `${(px - .5) * 10}deg`);
        el.style.setProperty('--gx', `${px * 100}%`); el.style.setProperty('--gy', `${py * 100}%`);
      });
      el.addEventListener('mouseleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* --------------------------------------------------------- HERO VISUALS
     One interactive scene per page. Canvas scenes pause when off screen. */
  const mouse = {x: innerWidth / 2, y: innerHeight / 2};
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, {passive: true});
  const mkCanvas = host => {
    const c = document.createElement('canvas'); host.appendChild(c);
    const ctx = c.getContext('2d'); const s = {c, ctx, w: 0, h: 0};
    const size = () => { const r = host.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); s.w = r.width; s.h = r.height; c.width = r.width * d; c.height = r.height * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size); return s;
  };
  const runScene = (host, draw) => {
    let live = false, raf;
    const io = new IntersectionObserver(es => { live = es[0].isIntersecting; if (live && !raf) loop(performance.now()); });
    const loop = t => { if (!live || reduced) { raf = 0; return; } draw(t); raf = requestAnimationFrame(loop); };
    io.observe(host); if (reduced) draw(0);
  };
  const local = host => { const r = host.getBoundingClientRect(); return {x: mouse.x - r.left, y: mouse.y - r.top, in: mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom}; };

  const scenes = {
    // FRAUD: a story graph. Each claim is a node; one link in the chain is broken.
    graph(host) {
      const s = mkCanvas(host);
      const labels = ['CLAIM', 'INVOICE', 'DATE', 'IDENTITY', 'PAYMENT', 'EMAIL', 'DOMAIN', 'SIGNATURE', 'ADDRESS', 'COMPANY', 'TIMELINE', 'AMOUNT'];
      const nodes = labels.map((l, i) => ({l, x: rnd(.12, .88), y: rnd(.1, .7), vx: rnd(-.0004, .0004), vy: rnd(-.0004, .0004), r: rnd(3, 5)}));
      const edges = [];
      nodes.forEach((n, i) => { const near = nodes.map((m, j) => ({j, d: Math.hypot(n.x - m.x, n.y - m.y)})).filter(o => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 2); near.forEach(o => { if (!edges.some(e => (e.a === i && e.b === o.j) || (e.a === o.j && e.b === i))) edges.push({a: i, b: o.j}); }); });
      edges[2].broken = true; edges[6].conflict = true;
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host); ctx.clearRect(0, 0, w, h);
        let hov = -1;
        nodes.forEach((n, i) => {
          n.x += n.vx; n.y += n.vy; if (n.x < .08 || n.x > .92) n.vx *= -1; if (n.y < .08 || n.y > .72) n.vy *= -1;
          const px = n.x * w, py = n.y * h;
          if (m.in) { const dx = px - m.x, dy = py - m.y, d = Math.hypot(dx, dy); if (d < 110 && d > 0) { n.x += dx / d * .0012; n.y += dy / d * .0012; } if (d < 26) hov = i; }
        });
        edges.forEach(e => {
          const a = nodes[e.a], b = nodes[e.b], hi = hov === e.a || hov === e.b;
          ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h);
          ctx.setLineDash(e.broken ? [4, 6] : []); ctx.lineDashOffset = -t / 40;
          ctx.strokeStyle = e.broken ? `rgba(255,112,78,${.6 + Math.sin(t / 180) * .3})` : e.conflict ? 'rgba(197,138,0,.7)' : hi ? 'rgba(47,91,255,.8)' : 'rgba(17,17,17,.14)';
          ctx.lineWidth = hi || e.broken ? 1.6 : 1; ctx.stroke(); ctx.setLineDash([]);
          if (e.broken) { const mx = (a.x + b.x) / 2 * w, my = (a.y + b.y) / 2 * h; ctx.fillStyle = '#ff704e'; ctx.font = MONO; ctx.fillText('CHAIN BREAK', mx + 8, my - 6); }
        });
        nodes.forEach((n, i) => {
          const px = n.x * w, py = n.y * h, hi = hov === i;
          ctx.beginPath(); ctx.arc(px, py, hi ? n.r + 3 : n.r, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#111'; ctx.fill();
          if (hi) { ctx.beginPath(); ctx.arc(px, py, n.r + 10, 0, 7); ctx.strokeStyle = 'rgba(47,91,255,.4)'; ctx.stroke(); }
          ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.6)'; ctx.font = MONO; ctx.fillText(n.l, px + 9, py + 3);
        });
        ctx.fillStyle = 'rgba(17,17,17,.5)'; ctx.font = MONO; ctx.fillText(`STORY GRAPH · ${nodes.length} CLAIMS · 1 BREAK · 1 CONFLICT`, 18, h - 18);
      });
    },
    // INTEGRATIONS: sources orbit the core and send pulses down their spokes.
    orbit(host) {
      const s = mkCanvas(host);
      const src = [['REGISTRY', 0], ['COURTS', 0], ['PAYMENTS', 1], ['ACCOUNTING', 1], ['EMAIL', 1], ['CLOUD', 2], ['WEB', 2], ['API', 2]];
      const rings = [.18, .28, .38];
      const nodes = src.map(([l, ring], i) => ({l, ring, a: i * 1.3, sp: [.00045, -.0003, .0002][ring]}));
      const pulses = nodes.map(() => Math.random());
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host), cx = w / 2, cy = h * .44, R = Math.min(w, h);
        ctx.clearRect(0, 0, w, h);
        const tilt = m.in ? (m.x - cx) / w : 0;
        rings.forEach(r => { ctx.beginPath(); ctx.ellipse(cx, cy, r * R, r * R * (.92 - Math.abs(tilt) * .25), 0, 0, 7); ctx.strokeStyle = 'rgba(17,17,17,.1)'; ctx.stroke(); });
        let near = -1, nd = 40;
        nodes.forEach((n, i) => {
          n.a += n.sp * (1 + tilt * 2 * (n.ring % 2 ? -1 : 1)) * 16;
          const r = rings[n.ring] * R, x = cx + Math.cos(n.a) * r, y = cy + Math.sin(n.a) * r * (.92 - Math.abs(tilt) * .25);
          n.x = x; n.y = y;
          if (m.in) { const d = Math.hypot(x - m.x, y - m.y); if (d < nd) { nd = d; near = i; } }
        });
        nodes.forEach((n, i) => {
          const hi = near === i;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.strokeStyle = hi ? 'rgba(47,91,255,.7)' : 'rgba(17,17,17,.12)'; ctx.lineWidth = hi ? 1.5 : 1; ctx.stroke();
          pulses[i] = (pulses[i] + (hi ? .02 : .006)) % 1;
          const px = lerp(n.x, cx, pulses[i]), py = lerp(n.y, cy, pulses[i]);
          ctx.beginPath(); ctx.arc(px, py, 2.2, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#ff704e'; ctx.fill();
          ctx.beginPath(); ctx.arc(n.x, n.y, hi ? 7 : 5, 0, 7); ctx.fillStyle = hi ? '#2f5bff' : '#fffdfa'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
          ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.65)'; ctx.font = MONO; ctx.fillText(hi ? n.l + ' · CONNECTED' : n.l, n.x + 10, n.y + 3);
        });
        ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.fillStyle = '#111'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, 34 + Math.sin(t / 300) * 3, 0, 7); ctx.strokeStyle = 'rgba(47,91,255,.35)'; ctx.stroke();
        ctx.fillStyle = '#dffd64'; ctx.font = '800 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('E1', cx, cy + 4); ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(17,17,17,.5)'; ctx.font = MONO; ctx.fillText('SOURCE MESH · 8 CONNECTED · AUTHORIZED ONLY', 18, h - 18);
      });
    },
    // HOW: a pipeline. Files flow through four stages and pick up a verdict.
    pipeline(host) {
      const s = mkCanvas(host);
      const stages = ['INGEST', 'EXTRACT', 'CROSS CHECK', 'EXPLAIN'];
      const parts = Array.from({length: 14}, (_, i) => ({p: i / 14, y: rnd(.3, .7), v: rnd(.0009, .0016), c: 0}));
      const col = ['#8b867e', '#2f5bff', '#0f8a4b', '#ff704e'];
      runScene(host, t => {
        const {ctx, w, h} = s, m = local(host); ctx.clearRect(0, 0, w, h);
        const pad = 34, gap = (w - pad * 2) / 4, top = h * .3, bh = h * .4;
        stages.forEach((l, i) => {
          const x = pad + i * gap + 8, bw = gap - 16, hi = m.in && m.x > x && m.x < x + bw;
          ctx.beginPath(); ctx.roundRect(x, top, bw, bh, 14); ctx.fillStyle = hi ? 'rgba(47,91,255,.08)' : 'rgba(255,255,255,.7)'; ctx.strokeStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.16)'; ctx.fill(); ctx.stroke();
          ctx.fillStyle = hi ? '#2f5bff' : 'rgba(17,17,17,.5)'; ctx.font = MONO; ctx.fillText(`0${i + 1}`, x + 12, top + 18); ctx.fillStyle = '#111'; ctx.font = '700 12px Inter, sans-serif'; ctx.fillText(l, x + 12, top + bh - 14);
          if (i < 3) { const ax = x + bw, ay = top + bh / 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 16, ay); ctx.strokeStyle = 'rgba(17,17,17,.3)'; ctx.stroke(); }
        });
        parts.forEach(q => {
          q.p += q.v; if (q.p > 1.02) { q.p = -.02; q.c = 0; q.y = rnd(.3, .7); }
          const stage = Math.floor(clamp(q.p, 0, .999) * 4);
          if (stage >= 1 && q.c === 0) q.c = 1; if (stage >= 2 && q.c === 1) q.c = Math.random() < .3 ? 3 : 2;
          const x = pad + q.p * (w - pad * 2), y = top + q.y * bh;
          ctx.beginPath(); ctx.roundRect(x - 5, y - 6, 10, 12, 2); ctx.fillStyle = col[q.c]; ctx.fill();
        });
        ctx.fillStyle = 'rgba(17,17,17,.5)'; ctx.font = MONO; ctx.fillText('PIPELINE · GREY FILE → BLUE CLAIMS → GREEN CONFIRMED / ORANGE CONFLICT', 18, h - 18);
      });
    },
    // VERIFY: an intake console that types real-looking case logs.
    console(host) {
      const pre = document.createElement('div'); pre.className = 'console'; host.appendChild(pre);
      const cases = [
        ['> intake receipt_0412.pdf', ['merchant', 'ok', 'matched · registry'], ['total', 'bad', '1,284.00 ≠ 1,248.00'], ['date', 'unk', 'not verifiable'], ['payment', 'ok', 'processor record']],
        ['> intake contract_v3.docx', ['dates', 'ok', 'match email thread'], ['company no.', 'bad', 'differs from registry'], ['signature', 'warn', 'image reused'], ['payment claim', 'unk', 'no evidence']],
        ['> intake message.eml', ['sender domain', 'bad', 'registered 3 days ago'], ['identity', 'warn', 'name ≠ org record'], ['timeline', 'bad', 'impossible sequence'], ['attachment', 'ok', 'hash known']]
      ];
      const labels = {ok: '✓', bad: '✕', warn: '!', unk: '?'};
      let ci = 0, li = 0, ch = 0, lineEl;
      const step = () => {
        if (reduced) { pre.innerHTML = cases.map(c => `<div class="cl">${c[0]}</div>` + c.slice(1).map(l => `<div class="cl s-${l[1]}"><span>${l[0]}</span><b>${labels[l[1]]}</b><em>${l[2]}</em></div>`).join('')).join(''); return; }
        const c = cases[ci];
        if (li === 0 && ch === 0) { pre.innerHTML = ''; }
        if (li === 0) {
          if (!lineEl) { lineEl = document.createElement('div'); lineEl.className = 'cl typing'; pre.appendChild(lineEl); }
          lineEl.textContent = c[0].slice(0, ++ch);
          if (ch >= c[0].length) { lineEl.classList.remove('typing'); lineEl = null; li++; ch = 0; setTimeout(step, 320); return; }
          setTimeout(step, 38); return;
        }
        const l = c[li];
        const el = document.createElement('div'); el.className = `cl s-${l[1]}`; el.innerHTML = `<span>${l[0]}</span><b>${labels[l[1]]}</b><em>${l[2]}</em>`; pre.appendChild(el);
        li++;
        if (li >= c.length) { ci = (ci + 1) % cases.length; li = 0; ch = 0; setTimeout(step, 2200); return; }
        setTimeout(step, 420);
      };
      step();
    },
    // RECEIPTS: a receipt that gets recalculated live. One altered digit is caught.
    receipt(host) {
      const el = document.createElement('div'); el.className = 'receipt'; host.appendChild(el);
      const items = [['Coffee beans 1kg', 42.00], ['Grinder service', 120.00], ['Delivery', 18.00], ['Filters ×3', 24.00]];
      const sub = items.reduce((a, b) => a + b[1], 0), tax = +(sub * .17).toFixed(2), real = +(sub + tax).toFixed(2), fake = real + 36;
      const money = n => n.toLocaleString('en-US', {minimumFractionDigits: 2});
      el.innerHTML = `<div class="rHead"><b>NORTH ROAST LTD</b><span>INV-20418 · 03.04.2026</span></div>
        ${items.map(i => `<div class="rRow"><span>${i[0]}</span><span>${money(i[1])}</span></div>`).join('')}
        <div class="rRow sub"><span>Subtotal</span><span>${money(sub)}</span></div>
        <div class="rRow"><span>VAT 17%</span><span>${money(tax)}</span></div>
        <div class="rRow total"><span>TOTAL</span><span class="rTotal">${money(fake)}</span></div>
        <div class="rScan"></div><div class="rStamp">RECALCULATED ✓</div><div class="rFlag">+36.00 ALTERED</div>`;
      const total = el.querySelector('.rTotal');
      if (reduced) { total.textContent = money(real); el.classList.add('done'); return; }
      const cycle = () => {
        el.classList.remove('done', 'scan', 'flag'); total.textContent = money(fake);
        setTimeout(() => el.classList.add('scan'), 500);
        setTimeout(() => el.classList.add('flag'), 1500);
        setTimeout(() => { let n = 0; const iv = setInterval(() => { n++; total.textContent = n < 12 ? money(rnd(real - 40, real + 40)) : money(real); if (n >= 12) { clearInterval(iv); el.classList.add('done'); } }, 55); }, 2300);
        setTimeout(cycle, 5600);
      };
      cycle();
    },
    // LEGAL: stacked pages, clauses get annotated, redactions lift on hover.
    pages(host) {
      const el = document.createElement('div'); el.className = 'pages'; host.appendChild(el);
      const notes = [['§2.1 DATE ≠ EMAIL THREAD', 'bad', 22, 30], ['REG. NO. MATCHES REGISTRY', 'ok', 46, 62], ['§7 SIGNATURE IMAGE REUSED', 'warn', 70, 40]];
      el.innerHTML = `<div class="pg p3"></div><div class="pg p2"></div><div class="pg p1">
        <div class="pgTitle">SERVICE AGREEMENT</div>
        ${Array.from({length: 11}, (_, i) => `<div class="pgLine ${[2, 5, 8].includes(i) ? 'redact' : ''}" style="width:${[92, 78, 88, 60, 90, 84, 70, 92, 66, 88, 50][i]}%"></div>`).join('')}
        <div class="pgSig"></div>
        ${notes.map((n, i) => `<div class="pgNote s-${n[1]}" style="top:${n[2]}%;left:${n[3]}%"><i></i>${n[0]}</div>`).join('')}</div>`;
      const ns = [...el.querySelectorAll('.pgNote')];
      if (reduced) { ns.forEach(n => n.classList.add('on')); return; }
      let k = 0; setInterval(() => { ns.forEach((n, i) => n.classList.toggle('on', i <= k % (ns.length + 1) - 1)); k++; }, 1300);
    }
  };
  document.querySelectorAll('[data-visual]').forEach(host => scenes[host.dataset.visual]?.(host));

  /* ----------------------------------------------------------- CURSOR
     One cursor, a personality per zone: lens | inspect | scan | link | verdict | ledger | xray */
  const xrays = [...document.querySelectorAll('.xray')];
  const setXray = (layer, cx, cy) => { const r = layer.getBoundingClientRect(); layer.style.setProperty('--x', `${cx - r.left}px`); layer.style.setProperty('--y', `${cy - r.top}px`); };
  const hideXray = layer => { layer.style.setProperty('--x', '-999px'); layer.style.setProperty('--y', '-999px'); };

  if (fine && !reduced) {
    document.documentElement.classList.add('e1-cur');
    const cur = document.createElement('div'); cur.className = 'e1-cursor'; cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<i class="cx"></i><i class="cy"></i><div class="c-ring"><i class="c-orb"></i><i class="c-orb"></i><i class="c-orb"></i></div><div class="c-lens"><div class="c-glass"></div></div><i class="c-handle"></i><div class="c-label"></div>';
    const dot = document.createElement('i'); dot.className = 'e1-dot';
    const blend = document.createElement('i'); blend.className = 'e1-blend';
    body.append(cur, dot, blend);
    const label = cur.querySelector('.c-label');
    const MODES = ['lens', 'inspect', 'scan', 'link', 'verdict', 'ledger', 'xray'];
    let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, shown = false, mode = '', hov = null, zone = null, ledgerTimer = 0;
    const pad = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    const say = (text, status) => { label.className = 'c-label' + (text ? ' show' : '') + (status ? ' s-' + status : ''); if (text) label.textContent = text; };
    const setMode = m => { if (m === mode) return; MODES.forEach(k => { cur.classList.toggle('m-' + k, k === m); dot.classList.toggle('m-' + k, k === m); }); mode = m; hov = undefined; say(''); };
    const ledger = () => { clearInterval(ledgerTimer); let n = 0; ledgerTimer = setInterval(() => { n++; if (n > 9) { clearInterval(ledgerTimer); say('Σ MATCH ✓', 'confirmed'); return; } say('Σ ' + rnd(100, 9000).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')); }, 70); };
    const route = e => {
      const t = e.target instanceof Element ? e.target : body;
      const z = t.closest('[data-cursor]');
      const m = z?.dataset.cursor || '';
      if (z !== zone) { if (zone) zone.querySelectorAll('.xray').forEach(hideXray); zone = z; }
      setMode(m);
      const wide = !!t.closest('.visual'); cur.classList.toggle('wide', wide);
      blend.classList.toggle('on', m === 'lens' && !wide && shown);
      const h = t.closest('a,button,.card,.row,.integration,.flowStep,.chip,.panel,.stage');
      if (h !== hov) {
        hov = h; cur.classList.toggle('hov', !!h); blend.classList.toggle('hov', !!h);
        if (m === 'inspect') say(h?.matches('.card') ? (h.matches('a') ? 'OPEN CASE ↗' : 'INSPECT') : h ? 'OPEN ↗' : '');
        else if (m === 'link') say(h?.matches('.integration') ? 'LINK SOURCE' : 'CONNECT');
        else if (m === 'verdict') { const s = h?.dataset.status; say(s ? s : h ? 'EVIDENCE' : 'REVIEW', s); }
        else if (m === 'ledger') { if (h?.matches('.card')) ledger(); else { clearInterval(ledgerTimer); say('Σ RECALC'); } }
        else if (m === 'lens') say(h?.matches('.stage,.visual') ? 'INTERACT' : h ? 'OPEN ↗' : '');
        else say(h ? 'OPEN ↗' : '');
      }
      if (m === 'scan') say(`X ${pad(e.clientX)} · Y ${pad(e.clientY)}${h?.matches('.flowStep') ? ' · STEP ' + (h.querySelector('b')?.textContent || '') : ''}`);
    };
    addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; dot.style.transform = `translate3d(${tx}px,${ty}px,0)`; if (!shown) { x = tx; y = ty; shown = true; cur.classList.add('on'); dot.classList.add('on'); } route(e); }, {passive: true});
    document.addEventListener('mouseleave', () => { shown = false; cur.classList.remove('on'); dot.classList.remove('on'); blend.classList.remove('on'); });
    addEventListener('mousedown', () => { cur.classList.add('down'); blend.classList.add('down'); }); addEventListener('mouseup', () => { cur.classList.remove('down'); blend.classList.remove('down'); });
    (function loop() {
      x = lerp(x, tx, .24); y = lerp(y, ty, .24);
      cur.style.transform = `translate3d(${x}px,${y}px,0)`;
      blend.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      if (zone && (mode === 'lens' || mode === 'xray')) zone.querySelectorAll('.xray').forEach(l => setXray(l, x, y));
      requestAnimationFrame(loop);
    })();
  } else if (!reduced && xrays.length) {
    const live = new Set();
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? live.add(e.target) : live.delete(e.target)));
    xrays.forEach(l => { l.style.setProperty('--r', '170px'); io.observe(l); });
    (function drift(t) { live.forEach(l => { const w = l.offsetWidth, h = l.offsetHeight, k = t / 1000; l.style.setProperty('--x', `${w / 2 + Math.sin(k * .6) * w * .38}px`); l.style.setProperty('--y', `${h / 2 + Math.cos(k * .45) * h * .32}px`); }); requestAnimationFrame(drift); })(0);
  }

  /* ------------------------------------------------------- MOBILE MENU */
  const btn = document.querySelector('.mobileBtn');
  const panel = document.querySelector('.mobilePanel');
  if (btn && !btn.querySelector('span')) btn.innerHTML = '<span></span>';
  let backdrop = document.querySelector('.menuBackdrop');
  if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'menuBackdrop'; body.appendChild(backdrop); }
  const setMenu = open => {
    btn?.classList.toggle('open', open); panel?.classList.toggle('open', open); backdrop.classList.toggle('open', open);
    body.classList.toggle('menuOpen', open); nav?.classList.remove('hide');
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (innerWidth <= 760) body.style.overflow = open ? 'hidden' : '';
  };
  btn?.addEventListener('click', () => setMenu(!panel?.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  panel?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('resize', () => { if (innerWidth > 760) setMenu(false); });

  /* --------------------------------------------------- PAGE TRANSITION */
  if (!reduced) {
    const veil = document.createElement('div'); veil.className = 'e1-transition'; body.appendChild(veil);
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || a.target === '_blank') return;
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const r = a.getBoundingClientRect();
        veil.style.setProperty('--tx', `${r.left + r.width / 2}px`); veil.style.setProperty('--ty', `${r.top + r.height / 2}px`);
        veil.classList.add('go');
        setTimeout(() => location.href = href, 300);
      });
    });
  }
})();
