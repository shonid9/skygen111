(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  // Short branded loader. Only once per tab so navigation stays fast.
  if (!reduced && !sessionStorage.getItem('e1Loaded')) {
    const loader = document.createElement('div');
    loader.className = 'e1-loader';
    loader.innerHTML = `<div class="e1-loadstage"><canvas></canvas><div class="e1-scanline"></div><div class="e1-lens"></div><div class="e1-loadcopy"><strong>EMET ONE</strong><span>VERIFYING SIGNALS</span></div></div>`;
    document.body.prepend(loader);
    const canvas = loader.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let raf;
    function size(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=r.width*d;canvas.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);return r}
    let rect=size();
    const pts=Array.from({length:28},()=>({x:Math.random()*rect.width,y:Math.random()*rect.height,r:Math.random()*1.5+.5,a:Math.random()*.35+.12}));
    function draw(){ctx.clearRect(0,0,rect.width,rect.height);pts.forEach(p=>{p.x+=.08;p.y+=Math.sin(p.x*.02)*.03;if(p.x>rect.width+10)p.x=-10;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(47,91,255,${p.a})`;ctx.fill()});for(let i=0;i<pts.length;i++){for(let j=i+1;j<pts.length;j++){const a=pts[i],b=pts[j],d=Math.hypot(a.x-b.x,a.y-b.y);if(d<88){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(17,17,17,${(1-d/88)*.06})`;ctx.stroke()}}}raf=requestAnimationFrame(draw)}
    draw();
    const finish=()=>{sessionStorage.setItem('e1Loaded','1');loader.classList.add('hide');setTimeout(()=>{cancelAnimationFrame(raf);loader.remove()},420)};
    setTimeout(finish,1050);
  }

  // Reveal on scroll
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), {threshold:.12});
  document.querySelectorAll('.reveal').forEach(e => ro.observe(e));

  // Responsive technology menu
  const btn = document.querySelector('.mobileBtn');
  const panel = document.querySelector('.mobilePanel');
  if (btn && !btn.querySelector('span')) btn.innerHTML = '<span></span>';
  let backdrop = document.querySelector('.menuBackdrop');
  if (!backdrop) { backdrop = document.createElement('div'); backdrop.className = 'menuBackdrop'; document.body.appendChild(backdrop); }
  const setMenu = open => {
    btn?.classList.toggle('open', open);
    panel?.classList.toggle('open', open);
    backdrop.classList.toggle('open', open);
    btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (innerWidth <= 760) document.body.style.overflow = open ? 'hidden' : '';
  };
  btn?.addEventListener('click', () => setMenu(!panel?.classList.contains('open')));
  backdrop.addEventListener('click', () => setMenu(false));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  panel?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('resize', () => { if (innerWidth > 760) setMenu(false); });

  // Data-driven polish: active nav link, reading progress, row status colours, hidden token layers
  const path = location.pathname.replace(/\/$/, '') || '/index.html';
  document.querySelectorAll('.links a,.mobilePanel a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '/' && href === '/index.html')) a.setAttribute('aria-current', 'page');
  });
  const progress = document.createElement('i');
  progress.className = 'e1-progress';
  document.body.appendChild(progress);
  const paint = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  };
  addEventListener('scroll', paint, {passive:true}); addEventListener('resize', paint); paint();
  document.querySelectorAll('.row').forEach(r => {
    const s = (r.querySelector('span:last-child')?.textContent || '').trim().toLowerCase();
    const status = ['confirmed','matched','conflict','review','unknown'].find(k => s.includes(k));
    if (status) r.dataset.status = status === 'matched' ? 'confirmed' : status;
  });
  document.querySelectorAll('.xray[data-tokens]').forEach(layer => {
    const words = layer.dataset.tokens.split('|');
    const frag = document.createElement('div'); frag.className = 'tokens';
    for (let i = 0; i < 160; i++) { const s = document.createElement('span'); s.textContent = words[i % words.length]; frag.appendChild(s); }
    layer.appendChild(frag);
  });

  // Section-aware cursor. Each zone declares data-cursor: lens | inspect | scan | link | verdict | ledger | xray
  const xrays = [...document.querySelectorAll('.xray')];
  const setXray = (layer, cx, cy) => {
    const r = layer.getBoundingClientRect();
    layer.style.setProperty('--x', `${cx - r.left}px`);
    layer.style.setProperty('--y', `${cy - r.top}px`);
  };
  const hideXray = layer => { layer.style.setProperty('--x', '-999px'); layer.style.setProperty('--y', '-999px'); };

  if (fine && !reduced) {
    document.documentElement.classList.add('e1-cur');
    const cur = document.createElement('div');
    cur.className = 'e1-cursor';
    cur.setAttribute('aria-hidden', 'true');
    cur.innerHTML = '<i class="cx"></i><i class="cy"></i><div class="c-ring"><i class="c-orb"></i><i class="c-orb"></i><i class="c-orb"></i></div><div class="c-lens"><div class="c-glass"></div></div><i class="c-handle"></i><div class="c-label"></div>';
    const dot = document.createElement('i');
    dot.className = 'e1-dot';
    document.body.append(cur, dot);
    const lens = cur.querySelector('.c-lens');
    const label = cur.querySelector('.c-label');
    const MODES = ['lens','inspect','scan','link','verdict','ledger','xray'];
    const SCALE = 1.7;

    let tx = innerWidth / 2, ty = innerHeight / 2, x = tx, y = ty, shown = false;
    let mode = '', hov = null, zone = null, magSrc = null, magClone = null, ledgerTimer = 0;

    const pad = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    const say = (text, status) => {
      label.className = 'c-label' + (text ? ' show' : '') + (status ? ' s-' + status : '');
      if (text) label.textContent = text;
    };
    const setMode = m => {
      if (m === mode) return;
      MODES.forEach(k => { cur.classList.toggle('m-' + k, k === m); dot.classList.toggle('m-' + k, k === m); });
      mode = m; hov = undefined; say('');
    };
    const setMag = src => {
      if (src === magSrc) return;
      magSrc = src;
      if (magClone) { magClone.remove(); magClone = null; }
      cur.classList.toggle('mag', !!src);
      if (!src) return;
      const cs = getComputedStyle(src);
      magClone = document.createElement('div');
      magClone.className = 'c-lensClone';
      magClone.innerHTML = src.innerHTML;
      magClone.style.cssText = `width:${src.getBoundingClientRect().width}px;font:${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily};letter-spacing:${cs.letterSpacing};text-align:${cs.textAlign};text-transform:${cs.textTransform}`;
      lens.prepend(magClone);
    };
    const ledger = () => {
      clearInterval(ledgerTimer);
      let n = 0;
      ledgerTimer = setInterval(() => {
        n++;
        if (n > 9) { clearInterval(ledgerTimer); say('Σ MATCH ✓', 'confirmed'); return; }
        say('Σ ' + (Math.random() * 9000 + 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      }, 70);
    };

    const route = e => {
      const t = e.target instanceof Element ? e.target : document.body;
      const mag = t.closest('[data-magnify]');
      const z = t.closest('[data-cursor]');
      const m = mag ? 'lens' : (z?.dataset.cursor || '');
      if (z !== zone) { if (zone) zone.querySelectorAll('.xray').forEach(hideXray); zone = z; }
      setMode(m);
      setMag(m === 'lens' ? mag : null);
      cur.classList.toggle('wide', !!t.closest('.visual'));
      const h = t.closest('a,button,.card,.row,.integration,.flowStep,.chip,.panel');
      if (h !== hov) {
        hov = h; cur.classList.toggle('hov', !!h);
        if (m === 'inspect') say(h?.matches('.card') ? (h.matches('a') ? 'OPEN CASE ↗' : 'INSPECT') : h ? 'OPEN ↗' : '');
        else if (m === 'link') say(h?.matches('.integration') ? 'LINK SOURCE' : 'CONNECT');
        else if (m === 'verdict') { const s = h?.dataset.status; say(s ? s : h ? 'EVIDENCE' : 'REVIEW', s); }
        else if (m === 'ledger') { if (h?.matches('.card')) ledger(); else { clearInterval(ledgerTimer); say('Σ RECALC'); } }
        else if (m === 'xray') say(h ? 'OPEN ↗' : '');
        else if (m === 'lens') say('');
        else say(h ? 'OPEN ↗' : '');
      }
      if (m === 'scan') say(`X ${pad(e.clientX)} · Y ${pad(e.clientY)}${h?.matches('.flowStep') ? ' · STEP ' + (h.querySelector('b')?.textContent || '') : ''}`);
    };

    addEventListener('mousemove', e => {
      tx = e.clientX; ty = e.clientY;
      dot.style.transform = `translate3d(${tx}px,${ty}px,0)`;
      if (!shown) { x = tx; y = ty; shown = true; cur.classList.add('on'); dot.classList.add('on'); }
      route(e);
    }, {passive:true});
    document.addEventListener('mouseleave', () => { shown = false; cur.classList.remove('on'); dot.classList.remove('on'); });
    addEventListener('mousedown', () => cur.classList.add('down'));
    addEventListener('mouseup', () => cur.classList.remove('down'));
    addEventListener('scroll', () => { if (magSrc) setMag(null); }, {passive:true});

    (function loop() {
      x += (tx - x) * .24; y += (ty - y) * .24;
      cur.style.transform = `translate3d(${x}px,${y}px,0)`;
      if (zone && (mode === 'lens' || mode === 'xray')) zone.querySelectorAll('.xray').forEach(l => setXray(l, x, y));
      if (magClone && magSrc) {
        const r = magSrc.getBoundingClientRect();
        const L = lens.offsetWidth / 2;
        magClone.style.transform = `translate(${L - (x - r.left) * SCALE}px,${L - (y - r.top) * SCALE}px) scale(${SCALE})`;
      }
      requestAnimationFrame(loop);
    })();
  } else if (!reduced && xrays.length) {
    // Touch devices get a slow drifting reveal so the hidden evidence layers are still discoverable.
    const live = new Set();
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? live.add(e.target) : live.delete(e.target)));
    xrays.forEach(l => { l.style.setProperty('--r', '170px'); io.observe(l); });
    (function drift(t) {
      live.forEach(l => {
        const w = l.offsetWidth, h = l.offsetHeight, k = t / 1000;
        l.style.setProperty('--x', `${w / 2 + Math.sin(k * .6) * w * .38}px`);
        l.style.setProperty('--y', `${h / 2 + Math.cos(k * .45) * h * .32}px`);
      });
      requestAnimationFrame(drift);
    })(0);
  }

  // Short page transition for internal navigation. Feels premium without slowing the site.
  if (!reduced) {
    const veil = document.createElement('div');
    veil.className = 'e1-transition';
    document.body.appendChild(veil);
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || a.target === '_blank') return;
      a.addEventListener('click', e => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const r = a.getBoundingClientRect();
        veil.style.setProperty('--tx', `${r.left+r.width/2}px`);
        veil.style.setProperty('--ty', `${r.top+r.height/2}px`);
        veil.classList.add('go');
        setTimeout(() => location.href = href, 280);
      });
    });
  }
})();
