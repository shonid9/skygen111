'use strict';

const crypto=require('crypto');
const LIMITS={free:1,lite:50,pro:300,business:2000};

function configured(){return Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.EMET_INTERNAL_DB_TOKEN)}

function bearerToken(req){
  const auth=String(req.headers.authorization||'');
  const match=auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]||null;
}

async function supabaseUser(req){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)return null;
  const token=bearerToken(req);if(!token)return null;
  try{
    const r=await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${token}`}});
    if(!r.ok)return null;const u=await r.json();return u?.id?u:null;
  }catch{return null}
}

function isVerifiedGoogleUser(user){
  if(!user?.id||!user?.email||user?.is_anonymous===true)return false;
  const meta=user.app_metadata||{};
  const providers=Array.isArray(meta.providers)?meta.providers:[];
  const google=meta.provider==='google'||providers.includes('google');
  const verified=Boolean(user.email_confirmed_at||user.confirmed_at||user.user_metadata?.email_verified);
  return google&&verified;
}

function clientFingerprint(req){
  if(!process.env.EMET_INTERNAL_DB_TOKEN)return null;
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||req.ip||req.socket?.remoteAddress||'';
  const ua=String(req.headers['user-agent']||'').slice(0,500);
  const lang=String(req.headers['accept-language']||'').slice(0,120);
  if(!ip||!ua)return null;
  return crypto.createHmac('sha256',process.env.EMET_INTERNAL_DB_TOKEN).update(`${ip}\n${ua}\n${lang}`).digest('hex');
}

async function userRpc(name,body,accessToken){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY||!accessToken)throw new Error('Account entitlement database is not configured.');
  const r=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{'content-type':'application/json',apikey:process.env.SUPABASE_PUBLISHABLE_KEY,authorization:`Bearer ${accessToken}`},
    body:JSON.stringify(body||{})
  });
  if(!r.ok)throw new Error(`Entitlement RPC ${name} failed (${r.status}).`);
  return r.json();
}

async function requireUser(req,res,next){
  const user=await supabaseUser(req);
  if(!user)return res.status(401).json({code:'AUTH_REQUIRED',error:'Sign in with Google to continue.'});
  req.authUser=user;req.authToken=bearerToken(req);next();
}

async function requireScanAccess(req,res,next){
  const user=await supabaseUser(req);
  if(!user)return res.status(401).json({code:'AUTH_REQUIRED',error:'Sign in with Google to use your free scan or paid plan.'});
  if(!isVerifiedGoogleUser(user))return res.status(403).json({code:'GOOGLE_ACCOUNT_REQUIRED',error:'A verified, non-anonymous Google account is required to scan.'});
  try{
    const token=bearerToken(req);
    const access=await userRpc('consume_scan_access_v3',{p_fingerprint:clientFingerprint(req)},token);
    if(!access?.allowed){
      if(access?.reason==='trial_abuse_guard')return res.status(429).json({code:'TRIAL_ABUSE_GUARD',error:'The free trial has already been claimed by several accounts from this environment. Choose a plan to continue.',access});
      if(access?.reason==='trial_identity_unavailable')return res.status(403).json({code:'TRIAL_IDENTITY_UNAVAILABLE',error:'We could not securely bind this free trial to the current environment. Sign in again or choose a plan.',access});
      const msg=access?.reason==='scan_limit_reached'?'Your included scans are used up. Choose a plan to continue.':'Your subscription is not active. Choose a plan to continue.';
      return res.status(402).json({code:'PLAN_REQUIRED',error:msg,access});
    }
    req.authUser=user;req.authToken=token;req.scanAccess=access;
    res.setHeader('X-EMET-Plan',String(access.plan||'free'));
    res.setHeader('X-EMET-Scans-Remaining',String(access.remaining??0));
    next();
  }catch(e){
    console.error('Access control failed:',e.message);
    return res.status(503).json({code:'ACCESS_UNAVAILABLE',error:'Account access check is temporarily unavailable.'});
  }
}

async function accountStatus(accessToken){return userRpc('get_scan_access_v3',{},accessToken)}

module.exports={LIMITS,configured,bearerToken,supabaseUser,isVerifiedGoogleUser,clientFingerprint,requireUser,requireScanAccess,accountStatus,userRpc};
