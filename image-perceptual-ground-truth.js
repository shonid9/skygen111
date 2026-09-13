'use strict';
const sharp=require('sharp');

function bitsToHex(bits){let out='';for(let i=0;i<bits.length;i+=4){let n=0;for(let j=0;j<4;j++)n=(n<<1)|(bits[i+j]||0);out+=n.toString(16)}return out}
function pop4(n){n=n-((n>>1)&0x5);n=(n&3)+((n>>2)&3);return n}
function hammingHex(a,b){if(!a||!b||a.length!==b.length)return Infinity;let d=0;for(let i=0;i<a.length;i++){const x=parseInt(a[i],16)^parseInt(b[i],16);d+=pop4(x)}return d}
function similarity(a,b){const d=hammingHex(a,b);return Number.isFinite(d)?1-d/(a.length*4):0}
async function imageHashes(buffer){
  const meta=await sharp(buffer,{failOn:'none'}).rotate().metadata();
  const {data:a}=await sharp(buffer,{failOn:'none'}).rotate().resize(16,16,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  let mean=0;for(const v of a)mean+=v;mean/=a.length||1;const ahash256=bitsToHex([...a].map(v=>v>=mean?1:0));
  const {data:d}=await sharp(buffer,{failOn:'none'}).rotate().resize(17,16,{fit:'fill'}).greyscale().raw().toBuffer({resolveWithObject:true});
  const bits=[];for(let y=0;y<16;y++)for(let x=0;x<16;x++)bits.push(d[y*17+x+1]>=d[y*17+x]?1:0);
  const dhash256=bitsToHex(bits),width=meta.width||0,height=meta.height||0;
  return{ahash256,dhash256,width,height,aspectRatio:height?width/height:null};
}
async function fetchKnown(){
  const base=String(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY||'',token=process.env.EMET_INTERNAL_DB_TOKEN||'';
  if(!base||!key||!token)return[];
  try{
    const r=await fetch(base+'/rest/v1/rpc/list_ground_truth_image_fingerprints_internal',{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},body:JSON.stringify({p_token:token})});
    if(!r.ok)return[];const rows=await r.json();return Array.isArray(rows)?rows:[];
  }catch{return[]}
}
function scoreRow(q,row){
  const a=similarity(q.ahash256,row.ahash256),d=similarity(q.dhash256,row.dhash256),aspect=row.aspect_ratio?Number(row.aspect_ratio):null;
  const ar=q.aspectRatio&&aspect?Math.max(0,1-Math.abs(q.aspectRatio-aspect)/Math.max(q.aspectRatio,aspect)):1;
  const score=(a*.42+d*.48+ar*.10);
  return{...row,similarity:+score.toFixed(4),ahashSimilarity:+a.toFixed(4),dhashSimilarity:+d.toFixed(4),aspectSimilarity:+ar.toFixed(4)};
}
async function matchPerceptualGroundTruth(buffer){
  const query=await imageHashes(buffer),rows=await fetchKnown();
  const ranked=rows.map(r=>scoreRow(query,r)).sort((a,b)=>b.similarity-a.similarity);
  const best=ranked[0]||null,bestAI=ranked.filter(r=>r.label==='ai'||r.label==='ai_edited').sort((a,b)=>b.similarity-a.similarity)[0]||null,bestHuman=ranked.filter(r=>r.label==='human'||r.label==='human_edited').sort((a,b)=>b.similarity-a.similarity)[0]||null;
  const margin=(bestAI?.similarity||0)-(bestHuman?.similarity||0);
  let classification='none',confidence='none';
  if(best&&best.similarity>=.965){classification=best.label;confidence='very_high_near_duplicate'}
  else if(bestAI&&bestAI.similarity>=.90&&margin>=.045){classification='ai';confidence='high_lineage_similarity'}
  else if(bestHuman&&bestHuman.similarity>=.90&&margin<=-.045){classification='human';confidence='high_lineage_similarity'}
  return{version:'EMET-PERCEPTUAL-GT-2026.09.13',query,best,bestAI,bestHuman,contrastMargin:+margin.toFixed(4),classification,confidence,knownSamples:rows.length};
}
module.exports={imageHashes,matchPerceptualGroundTruth,hammingHex,similarity};
