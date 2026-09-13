'use strict';

const LIMITS={free:1,lite:50,pro:300,business:2000};

function configured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.EMET_INTERNAL_DB_TOKEN)}

async function supabaseUser(req){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)return null;
  const auth=String(req.headers.authorization||'');
  const m=auth.match(/^Bearer\s+(.+)$/i);if(!m)return null;
  try{
    const r=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${m[1]}`}});
    if(!r.ok)return null;const u=await r.json();return u?.id?u:null;
  }catch{return null}
}

async function rpc(name,body){
  if(!configured())throw new Error('Account entitlement database is not configured.');
  const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{'content-type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`},
    body:JSON.stringify({...body,p_token:process.env.EMET_INTERNAL_DB_TOKEN})
  });
  if(!r.ok)throw new Error(`Entitlement RPC ${name} failed (${r.status}).`);
  return r.json();
}

async function requireUser(req,res,next){
  const user=await supabaseUser(req);
  if(!user)return res.status(401).json({code:'AUTH_REQUIRED',error:'Sign in with Google to continue.'});
  req.authUser=user;next();
}

async function requireScanAccess(req,res,next){
  const user=await supabaseUser(req);
  if(!user)return res.status(401).json({code:'AUTH_REQUIRED',error:'Sign in with Google to use your free scan or paid plan.'});
  try{
    const access=await rpc('consume_scan_access_internal',{p_user_id:user.id});
    if(!access?.allowed){
      const msg=access?.reason==='scan_limit_reached'?'Your included scans are used up. Choose a plan to continue.':'Your subscription is not active. Choose a plan to continue.';
      return res.status(402).json({code:'PLAN_REQUIRED',error:msg,access});
    }
    req.authUser=user;req.scanAccess=access;
    res.setHeader('X-EMET-Plan',String(access.plan||'free'));
    res.setHeader('X-EMET-Scans-Remaining',String(access.remaining??0));
    next();
  }catch(e){
    console.error('Access control failed:',e.message);
    return res.status(503).json({code:'ACCESS_UNAVAILABLE',error:'Account access check is temporarily unavailable.'});
  }
}

async function accountStatus(userId){return rpc('get_scan_access_internal',{p_user_id:userId})}

async function applyBillingState({userId,plan,status,customerId,subscriptionId,eventId,payload}){
  return rpc('apply_billing_state_internal',{p_user_id:userId,p_plan:plan,p_status:status,p_customer_id:customerId||null,p_subscription_id:subscriptionId||null,p_provider_event_id:eventId||null,p_payload:payload||{}})
}

module.exports={LIMITS,configured,supabaseUser,requireUser,requireScanAccess,accountStatus,applyBillingState};
