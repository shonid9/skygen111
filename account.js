(()=>{
  const $=s=>document.querySelector(s); const msg=$('#accountMsg'), btn=$('#googleBtn'), planEl=$('#selectedPlan'), buyBtn=$('#buyBtn');
  const params=new URLSearchParams(location.search); const plan=params.get('plan')||localStorage.getItem('emet-plan')||'pro'; localStorage.setItem('emet-plan',plan); if(planEl)planEl.textContent=plan.toUpperCase();
  let config=null, sb=null, user=null;
  const say=(t,type='info')=>{if(!msg)return;msg.textContent=t;msg.style.background=type==='error'?'rgba(255,112,78,.12)':'rgba(47,91,255,.07)'};
  async function init(){
    try{config=await fetch('/api/config').then(r=>r.json());
      if(config.googleAuthConfigured && window.supabase){sb=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey);const {data}=await sb.auth.getSession();user=data.session?.user||null;if(user)signedIn(user);}
      if(params.get('checkout')==='success')say('Payment completed. Your subscription is being activated.');
    }catch{say('Account services are temporarily unavailable.','error')}
  }
  function signedIn(u){user=u;if(btn){btn.textContent=u.email||'Signed in';btn.disabled=true}if(buyBtn)buyBtn.hidden=false;say(`Signed in as ${u.email}. Selected plan: ${plan.toUpperCase()}.`)}
  btn?.addEventListener('click',async()=>{
    if(!config)await init();
    if(!config?.googleAuthConfigured){say('Google sign-in is not connected to the production auth project yet. The free scanner still works without an account.');return;}
    try{const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/account.html?plan='+encodeURIComponent(plan)}});if(error)throw error;}catch(e){say(e.message,'error')}
  });
  buyBtn?.addEventListener('click',async()=>{
    if(!user){say('Sign in with Google first.');return;}
    try{buyBtn.disabled=true;const r=await fetch('/api/create-checkout-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan,email:user.email,userId:user.id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout unavailable');location.href=d.url;}catch(e){say(e.message,'error');buyBtn.disabled=false;}
  });
  init();
})();