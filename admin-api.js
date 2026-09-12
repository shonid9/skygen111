'use strict';
const {train}=require('./training-engine');

function installAdminApi(app){
  const base=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=()=>process.env.SUPABASE_PUBLISHABLE_KEY||'';
  async function sb(path,token,{method='GET',body,headers={}}={}){
    const r=await fetch(base()+path,{method,headers:{apikey:key(),authorization:`Bearer ${token}`,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await r.text();let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
    if(!r.ok){const e=new Error(data?.message||data?.error||`Supabase ${r.status}`);e.statusCode=r.status;throw e}return data;
  }
  async function requireAdmin(req){
    if(!base()||!key()){const e=new Error('Admin backend is not configured.');e.statusCode=503;throw e}
    const h=String(req.headers.authorization||''),token=h.startsWith('Bearer ')?h.slice(7).trim():'';
    if(!token){const e=new Error('Sign in required.');e.statusCode=401;throw e}
    const u=await fetch(base()+'/auth/v1/user',{headers:{apikey:key(),authorization:`Bearer ${token}`}});
    if(!u.ok){const e=new Error('Invalid or expired session.');e.statusCode=401;throw e}
    const user=await u.json();
    const rows=await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,role`,token);
    const profile=Array.isArray(rows)?rows[0]:null;
    if(profile?.role!=='admin'){const e=new Error('Admin role required.');e.statusCode=403;throw e}
    return{token,user,profile};
  }
  app.get('/api/admin/status',async(req,res)=>{try{const a=await requireAdmin(req);res.json({ok:true,user:{id:a.user.id,email:a.user.email},role:'admin'});}catch(e){res.status(e.statusCode||500).json({ok:false,error:e.message})}});
  app.post('/api/admin/train',async(req,res)=>{
    try{
      const a=await requireAdmin(req),language=String(req.body?.language||'he').slice(0,16),domain=String(req.body?.domain||'general').slice(0,80);
      const rows=await sb(`/rest/v1/training_candidates?review_status=eq.approved&trust_tier=gte.2&language=eq.${encodeURIComponent(language)}&select=*`,a.token);
      const trained=train(Array.isArray(rows)?rows:[]);
      const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14),version=`emet-${language}-${domain}-${stamp}`;
      const runPayload={model_family:'emet_local_logistic',base_version:null,candidate_version:version,language,domain,dataset_snapshot:{counts:trained.counts,...trained.dataset},parameters:trained.parameters,metrics:{train:trained.train,test:trained.test},status:'candidate',started_at:new Date().toISOString(),finished_at:new Date().toISOString(),created_by:a.user.id};
      const run=await sb('/rest/v1/training_runs',a.token,{method:'POST',body:runPayload,headers:{Prefer:'return=representation'}});const runRow=run?.[0];
      const artifact=Buffer.from(JSON.stringify(trained.model));const crypto=require('node:crypto'),sha=crypto.createHash('sha256').update(artifact).digest('hex');
      const reg=await sb('/rest/v1/model_registry',a.token,{method:'POST',body:{version,model_family:'emet_local_logistic',language,domain,artifact_sha256:sha,training_run_id:runRow?.id||null,metrics:{train:trained.train,test:trained.test,model:trained.model},status:'shadow'},headers:{Prefer:'return=representation'}});
      res.json({ok:true,version,run:runRow,model:reg?.[0],metrics:{train:trained.train,test:trained.test},dataset:trained.dataset});
    }catch(e){res.status(e.code==='INSUFFICIENT_DATA'?409:(e.statusCode||500)).json({ok:false,error:e.message,code:e.code||null})}
  });
  app.post('/api/admin/promote',async(req,res)=>{
    try{
      const a=await requireAdmin(req),version=String(req.body?.version||'').trim();if(!version)return res.status(400).json({error:'Model version required.'});
      const rows=await sb(`/rest/v1/model_registry?version=eq.${encodeURIComponent(version)}&select=*`,a.token),m=rows?.[0];if(!m)return res.status(404).json({error:'Model not found.'});
      const test=m.metrics?.test||{},balanced=Number(test.balancedAccuracy||0),n=Number(test.n||0);
      if(n<8||balanced<.75)return res.status(409).json({error:`Promotion blocked. Holdout n=${n}, balanced accuracy=${balanced}. Minimum n=8 and 0.75 required.`});
      await sb(`/rest/v1/model_registry?language=eq.${encodeURIComponent(m.language)}&domain=eq.${encodeURIComponent(m.domain)}&status=eq.active`,a.token,{method:'PATCH',body:{status:'retired'}});
      const updated=await sb(`/rest/v1/model_registry?version=eq.${encodeURIComponent(version)}`,a.token,{method:'PATCH',body:{status:'active',activated_by:a.user.id,activated_at:new Date().toISOString()},headers:{Prefer:'return=representation'}});
      res.json({ok:true,model:updated?.[0]||null});
    }catch(e){res.status(e.statusCode||500).json({ok:false,error:e.message})}
  });
}
module.exports={installAdminApi};
