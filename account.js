(()=>{
  const $=s=>document.querySelector(s);const msg=$('#accountMsg'),btn=$('#googleBtn'),planEl=$('#selectedPlan'),buyBtn=$('#buyBtn');
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
  async function signedIn(u){
    user=u;if(btn){btn.textContent=u.email||'Signed in';btn.disabled=true}
    const data=await loadAccount(),a=data?.access||{},remaining=Number(a.remaining??0),currentPlan=String(a.plan||'free');
    if(plan==='free'||!['lite','pro','business'].includes(plan)){if(buyBtn)buyBtn.hidden=true}else if(buyBtn){buyBtn.hidden=false;buyBtn.textContent=`Continue with ${plan.toUpperCase()}`}
    if(currentPlan==='free'&&remaining>0)say(`Signed in as ${u.email}. Your one free scan is ready.`);
    else if(currentPlan==='free')say(`Signed in as ${u.email}. Your free scan has already been used. Choose a plan to continue.`);
    else say(`Signed in as ${u.email}. ${currentPlan.toUpperCase()} has ${remaining} scans remaining this period.`);
  }
  async function init(){
    try{
      config=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
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
    if(!session?.access_token){say('Sign in with Google first.');return}
    try{
      buyBtn.disabled=true;
      const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({plan})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout unavailable');location.href=d.url;
    }catch(e){say(e.message,'error');buyBtn.disabled=false}
  });
  init();
})();