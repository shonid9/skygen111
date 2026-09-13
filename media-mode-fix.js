(()=>{
'use strict';
const IMAGE_RE=/\.(jpe?g|png|webp|tiff?)$/i;
let selectedFile=null,lastImageScan=null,lastUrl=null,renderSeq=0;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rememberFile(f){if(f&&IMAGE_RE.test(f.name||'')){selectedFile=f;window.__EMET_MEDIA_FILE=f;}else if(f){selectedFile=null;window.__EMET_MEDIA_FILE=null;}}
document.addEventListener('change',e=>{if(e.target?.id==='fileInput')rememberFile(e.target.files?.[0]);},true);
document.addEventListener('drop',e=>{const f=e.dataTransfer?.files?.[0];if(f)rememberFile(f);},true);

const nativeFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const r=await nativeFetch(input,init);
  try{
    const u=typeof input==='string'?input:input?.url||'';
    if(u.includes('/api/analyze')&&!u.includes('/api/analyze-text')&&r.ok){
      const d=await r.clone().json();
      if(d?.multimodal?.kind==='image'){
        lastImageScan=d;window.__EMET_MEDIA_LAST_SCAN=d;window.__EMET_LAST_SCAN=null;
        const seq=++renderSeq;setTimeout(()=>{if(seq===renderSeq)renderImageResult(d);},40);
      }else window.__EMET_LAST_SCAN=d;
    }
  }catch(err){console.warn('EMET media UI hook:',err);}
  return r;
};

function estimateImage(m){
  const vf=m?.visionFusion?.aiOriginEstimate;
  if(vf&&Number.isFinite(Number(vf.score))){
    const score=Math.max(0,Math.min(100,Number(vf.score))),confidence=vf.confidence||'unknown';
    const label=score>=85?'Strong synthetic-origin signal':score>=65?'Elevated synthetic-origin signal':score>=40?'Mixed synthetic characteristics':'Low synthetic-origin signal';
    return{score,confidence,label,agreement:Number(vf.agreement||0),whole:m?.visionFusion?.localization?.mode==='whole_image',reasons:(vf.signals||[]).filter(x=>Number(x.score)>=55).sort((a,b)=>b.score-a.score).map(x=>`${x.id.replaceAll('_',' ')}: ${Math.round(x.score)}/100`),camera:vf.cameraEvidence||null};
  }
  const s=Number(m?.syntheticImageSignal?.score||0),ela=Number(m?.recompression?.recompressionAnomalyScore||0),copy=Number(m?.copyMove?.copyMoveSignal||0),p=m?.pixelForensics||{},fingerprints=m?.metadata?.generatorFingerprints||[];
  if(fingerprints.length)return{score:Math.max(94,s),confidence:'high',label:'Strong AI origin signal',whole:true,reasons:[`Generator fingerprint: ${fingerprints.join(', ')}`]};
  const noise=Math.min(100,Math.max(0,(3-Number(p.noiseResidual||3))*18)),edge=Math.min(100,Math.max(0,Number(p.edgeEnergy||0)*3));
  let score=Math.round(s*.50+ela*.18+copy*.14+noise*.10+edge*.08);score=Math.max(1,Math.min(99,score));
  return{score,confidence:score>=70?'medium-high':score>=45?'medium':'low-medium',label:score>=75?'Strong AI or synthetic-edit signal':score>=55?'Elevated AI or synthetic-edit signal':score>=30?'Some synthetic characteristics':'Low synthetic signal',whole:score>=88,reasons:m?.syntheticImageSignal?.reasons||[]};
}

function panelHtml(d,e){
  const m=d.multimodal||{},vf=m.visionFusion||{},fp=(m?.metadata?.generatorFingerprints||[]).join(', '),name=selectedFile?.name||d?.file?.name||'Image',regions=vf?.localization?.regions||[];
  return `<section class="resultCard emetImageOriginPanel" data-image-origin-panel="1">
    <div class="emetImageHero"><div><div class="eyebrow">EMET VISION FUSION</div><h2>${esc(e.score)}% AI origin estimate</h2><p>${esc(e.label)} · confidence ${esc(e.confidence)}.</p></div><div class="emetImagePct">${esc(e.score)}<small>%</small></div></div>
    <div class="emetImageStage"><canvas class="emetImageCanvas" aria-label="Image forensic localization map"></canvas><div class="emetLegend"><span><i class="whole"></i>whole-image synthetic signal</span><span><i class="local"></i>localized anomaly region</span></div></div>
    <div class="emetImageSummary"><div><span>File</span><b>${esc(name)}</b></div><div><span>Evidence agreement</span><b>${esc(e.agreement??0)}/100</b></div><div><span>Localized regions</span><b>${regions.length}</b></div><div><span>Generator fingerprint</span><b>${fp?esc(fp):'None found'}</b></div><div><span>Camera evidence</span><b>${e.camera?esc(e.camera.score)+'/100':'N/A'}</b></div><div><span>Recompression</span><b>${m?.recompression?.supported?Math.round(Number(m.recompression.recompressionAnomalyScore||0))+'/100':'N/A'}</b></div></div>
    ${e.reasons?.length?`<div class="whyBox"><b>Signals contributing most</b>${e.reasons.slice(0,8).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
    ${regions.length?`<div class="whyBox"><b>Strongest localized regions</b>${regions.slice(0,6).map((r,i)=>`<span>Region ${i+1}: ${Math.round(r.score)}/100 · ${(r.w*100).toFixed(1)}% × ${(r.h*100).toFixed(1)}% of image</span>`).join('')}</div>`:''}
    <details class="advanced"><summary>Advanced image evidence</summary><div class="detailList"><div><span>Vision engine</span><b>${esc(vf.version||'local baseline')}</b></div><div><span>Dimensions</span><b>${esc(m?.dimensions?.width||'?')} × ${esc(m?.dimensions?.height||'?')}</b></div><div><span>Noise residual</span><b>${esc(vf?.globalForensics?.highPass??m?.pixelForensics?.noiseResidual??'N/A')}</b></div><div><span>Edge energy</span><b>${esc(vf?.globalForensics?.edge??m?.pixelForensics?.edgeEnergy??'N/A')}</b></div><div><span>Entropy</span><b>${esc(vf?.globalForensics?.entropy??m?.pixelForensics?.entropy??'N/A')}</b></div><div><span>8px periodicity</span><b>${esc(vf?.globalForensics?.grid8??'N/A')}</b></div><div><span>Methods</span><b>${esc((vf.method||[]).join(' · '))}</b></div></div></details>
    <p class="emetImageNote">Yellow regions come from server-side multi-scale localization, not a decorative overlay. EMET fuses residual noise, edge/noise disagreement, chroma consistency, entropy, periodicity, recompression, repeated-region evidence, generator metadata and camera-capture evidence.</p>
  </section>`;
}

async function drawMap(canvas,file,e,m){
  if(!canvas||!file)return;if(lastUrl){try{URL.revokeObjectURL(lastUrl);}catch{}}
  lastUrl=URL.createObjectURL(file);const img=new Image();img.decoding='async';img.src=lastUrl;await img.decode();
  const max=720,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,w,h);const regions=m?.visionFusion?.localization?.regions||[];
  if(e.whole){ctx.fillStyle='rgba(255,220,72,.17)';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(236,176,0,.9)';ctx.lineWidth=Math.max(2,w/320);ctx.strokeRect(2,2,w-4,h-4);}
  for(const r of regions){const x=r.x*w,y=r.y*h,rw=r.w*w,rh=r.h*h,a=Math.min(.34,.11+(Number(r.score)||0)/500);ctx.fillStyle=`rgba(255,218,70,${a})`;ctx.fillRect(x,y,rw,rh);ctx.strokeStyle='rgba(226,158,0,.9)';ctx.lineWidth=Math.max(1.5,w/500);ctx.strokeRect(x+.5,y+.5,Math.max(1,rw-1),Math.max(1,rh-1));ctx.fillStyle='rgba(20,20,20,.86)';ctx.font=`600 ${Math.max(10,Math.round(w/55))}px Inter, sans-serif`;ctx.fillText(`${Math.round(r.score)}%`,x+6,Math.max(14,y+16));}
}

function renderImageResult(d){
  if(d!==lastImageScan)return;const results=$('#results');if(!results)return;const e=estimateImage(d.multimodal);results.innerHTML=panelHtml(d,e);const canvas=results.querySelector('.emetImageCanvas');if(selectedFile)drawMap(canvas,selectedFile,e,d.multimodal).catch(err=>console.warn('EMET image map:',err));results.scrollIntoView({behavior:'smooth',block:'start'});
}
})();