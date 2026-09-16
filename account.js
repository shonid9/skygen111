(()=>{
  const $=s=>document.querySelector(s);const msg=$('#accountMsg'),btn=$('#googleBtn'),planEl=$('#selectedPlan'),buyBtn=$('#buyBtn'),portalBtn=$('#portalBtn'),signOutBtn=$('#signOutBtn'),history=$('#scanHistory'),scanRows=$('#scanRows');
  const params=new URLSearchParams(location.search);const plan=params.get('plan')||localStorage.getItem('emet-plan')||'pro';localStorage.setItem('emet-plan',plan);if(planEl)planEl.textContent=plan.toUpperCase();
  let config=null,sb=null,user=null,session=null,googleEnabled=false;
  const say=(t,type='info')=>{if(!msg)return;msg.textContent=t;msg.style.background=type==='error'?'rgba(255,112,78,.12)':'rgba(47,91,255,.07)'};
  async function providerEnabled(){
    if(!config?.supabaseUrl||!config?.supabasePublishableKey)return false;
    try{const r=await fetch(`${config.supabaseUrl}/auth/v1/settings`,{headers:{apikey:config.supabasePublishableKey},cache:'no-store'});if(!r.ok)return false;const d=await r.json();return d?.external?.google===true}catch{return false}
  }
  async function loadAccount(){
    if(!session?.access_token)return null;
    try{const r=await fetch('/api/account',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});if(!r.ok)return null;return r.json()}catch{return null}
  }
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function loadHistory(){
    if(!session?.access_token||!history||!scanRows)return;
    try{
      const r=await fetch('/api/scans',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});if(!r.ok)return;
      const rows=(await r.json()).scans||[];history.hidden=false;
      scanRows.innerHTML=rows.length?rows.map(s=>`<div class="scanRow"><div><b>${esc(s.filename)}</b><span>${new Date(s.created_at).toLocaleString()} · ${Math.max(0,Math.round((Number(s.size_bytes)||0)/1024))} KB</span></div><strong>${s.risk_score==null?'—':Math.round(Number(s.risk_score))}</strong></div>`).join(''):'<p class="sectionLead">No saved scans yet.</p>';
    }catch{}
  }
  function syncBillingButton(){
    if(!buyBtn)return;
    if(plan==='free'||!['lite','pro','business'].includes(plan)){buyBtn.hidden=true;return}
    buyBtn.hidden=false;buyBtn.textContent=`Continue with ${plan.toUpperCase()}`;
    if(config?.billingConfigured===false){buyBtn.disabled=true;buyBtn.textContent='Payments are being connected'}
  }
  async function signedIn(u){
    user=u;if(btn){btn.textContent=u.email||'Signed in';btn.disabled=true}if(signOutBtn)signOutBtn.hidden=false;
    const data=await loadAccount(),a=data?.access||{},remaining=Number(a.remaining??0),currentPlan=String(a.plan||'free');
    syncBillingButton();if(portalBtn)portalBtn.hidden=currentPlan==='free';
    if(currentPlan==='free'&&remaining>0)say(`Signed in as ${u.email}. Your one free scan is ready.`);
    else if(currentPlan==='free'&&config?.billingConfigured===false)say(`Signed in as ${u.email}. Your free scan has already been used. Paid checkout is not live yet.`);
    else if(currentPlan==='free')say(`Signed in as ${u.email}. Your free scan has already been used. Choose a plan to continue.`);
    else say(`Signed in as ${u.email}. ${currentPlan.toUpperCase()} has ${remaining} scans remaining this period.`);
    await loadHistory();
  }
  async function init(){
    try{
      config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());syncBillingButton();
      if(!window.supabase||!config.supabaseUrl||!config.supabasePublishableKey)throw new Error('Account service unavailable');
      sb=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);
      googleEnabled=await providerEnabled();
      if(!googleEnabled){if(btn)btn.disabled=false;say('Google sign in is not enabled on the production authentication project yet. Scanning remains locked until it is enabled.','error');return}
      const {data}=await sb.auth.getSession();session=data.session||null;user=session?.user||null;
      sb.auth.onAuthStateChange((_event,s)=>{session=s||null;user=session?.user||null;if(user)setTimeout(()=>signedIn(user),0)});
      if(user)await signedIn(user);else say('Sign in with Google to claim the single free scan attached to your account.');
      if(params.get('checkout')==='success')say('Payment completed. Your subscription is being activated.');
    }catch{say('Account services are temporarily unavailable.','error')}
  }
  btn?.addEventListener('click',async()=>{
    if(!config)await init();
    if(!googleEnabled||!sb){say('Google sign in is not enabled on the production authentication project yet. Scanning is locked until it is connected.','error');return}
    try{const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/account.html?plan='+encodeURIComponent(plan)}});if(error)throw error}catch(e){say(e.message,'error')}
  });
  buyBtn?.addEventListener('click',async()=>{
    if(config?.billingConfigured===false){say('Payments are not connected to production yet.','error');return}
    if(!session?.access_token){say('Sign in with Google first.');return}
    try{
      buyBtn.disabled=true;
      const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({plan})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout unavailable');location.href=d.url;
    }catch(e){say(e.message,'error');buyBtn.disabled=false}
  });
  portalBtn?.addEventListener('click',async()=>{
    if(!session?.access_token)return;
    try{portalBtn.disabled=true;const r=await fetch('/api/create-portal-session',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Billing management unavailable');location.href=d.url}catch(e){say(e.message,'error');portalBtn.disabled=false}
  });
  signOutBtn?.addEventListener('click',async()=>{if(sb)await sb.auth.signOut();location.href='/account.html'});
  init();
})();
