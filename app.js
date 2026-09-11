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

  // Cursor magnifier, subtle on desktop only
  const probe = document.querySelector('.probe');
  if (fine && probe) {
    addEventListener('mousemove', e => { probe.style.left=e.clientX+'px'; probe.style.top=e.clientY+'px'; probe.classList.add('on'); });
    addEventListener('mouseleave',()=>probe.classList.remove('on'));
    document.querySelectorAll('a,.btn,.card,.chip,.row,.integration,.flowStep').forEach(el=>{
      el.addEventListener('mouseenter',()=>probe.classList.add('big'));
      el.addEventListener('mouseleave',()=>probe.classList.remove('big'));
    });
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
