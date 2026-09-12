'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const SUPPORTED=new Set(['.jpg','.jpeg','.png','.webp','.tif','.tiff','.pdf','.mp4','.mov','.wav','.mp3']);
function interpretStore(store){
  if(typeof store==='string')store=JSON.parse(store);
  const active=store?.manifests?.[store?.active_manifest];
  if(!active)return{status:'not_found',manifestPresent:false,validationPassed:false,trusted:false,aiDeclared:false};
  const state=store.validation_state;
  const failures=store.validation_results?.activeManifest?.failure||[];
  const valid=['Valid','Trusted'].includes(state)&&failures.length===0;
  const trusted=state==='Trusted'&&valid;
  const actions=(active.assertions||[]).filter(a=>/^c2pa\.actions(?:\.v\d+)?$/.test(a.label||'')).flatMap(a=>a.data?.actions||[]);
  const sources=actions.map(a=>a.digitalSourceType).filter(x=>typeof x==='string');
  const aiDeclared=sources.some(x=>/^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/(?:trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia)$/.test(x));
  return{status:trusted?'trusted':valid?'valid_untrusted':state==='Invalid'?'invalid':'inconclusive',manifestPresent:true,validationPassed:valid,trusted,aiDeclared,validationState:state||null,activeManifest:store.active_manifest,claimGenerator:active.claim_generator||null,digitalSourceTypes:sources,validationFailures:failures.map(x=>x.code).filter(Boolean),claimAuthenticated:trusted,meaning:'Validation authenticates the signed claim, not the truth of the depicted scene or every word.'};
}
async function readProvenance(file){
  const ext=path.extname(file.originalname||'').toLowerCase();
  if(!SUPPORTED.has(ext))return{status:'unsupported',manifestPresent:false,validationPassed:false,trusted:false,aiDeclared:false};
  let dir,reader;
  try{
    const {Reader}=await import('@contentauth/c2pa-node');
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'emet-source-'));const name=path.join(dir,`asset${ext}`);await fs.writeFile(name,file.buffer);
    reader=await Reader.fromAsset({path:name},{verify:{verify_after_reading:true,verify_trust:true,ocsp_fetch:false,remote_manifest_fetch:false}});
    const r=interpretStore(reader.json());
    return {...r,revocationNetworkCheck:'not_checked',remoteFetch:'disabled'};
  }catch(e){
    const msg=String(e.message||e);
    if(/JumbfNotFound|NoClaim|no (?:c2pa )?manifest|no claim found/i.test(msg))return{status:'not_found',manifestPresent:false,validationPassed:false,trusted:false,aiDeclared:false};
    return{status:'failed',manifestPresent:false,validationPassed:false,trusted:false,aiDeclared:false,error:msg.slice(0,180)};
  }finally{try{if(typeof reader?.free==='function')reader.free();else if(typeof reader?.close==='function')reader.close();}catch{}if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={interpretStore,readProvenance};
