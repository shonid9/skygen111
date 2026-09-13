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
        const seq=++renderSeq;
        setTimeout(()=>{if(seq===renderSeq)renderImageResult(d);},30);
        setTimeout(()=>{if(seq===renderSeq)renderImageResult(d);},220);
      }else{
        window.__EMET_LAST_SCAN=d;
      }
    }
  }catch(err){console.warn('EMET media UI hook:',err);}
  return r;
};

function estimateImage(m){
  const s=Number(m?.syntheticImageSignal?.score||0),ela=Number(m?.recompression?.recompressionAnomalyScore||0),copy=Number(m?.copyMove?.copyMoveSignal||0),p=m?.pixelForensics||{};
  const fingerprints=m?.metadata?.generatorFingerprints||[];
  if(fingerprints.length)return{score:Math.max(94,s),confidence:'high',label:'Strong AI origin signal',whole:true,reasons:[`Generator fingerprint: ${fingerprints.join(', ')}`]};
  const noise=Math.min(100,Math.max(0,(3-Number(p.noiseResidual||3))*18));
  const edge=Math.min(100,Math.max(0,Number(p.edgeEnergy||0)*3));
  let score=Math.round(s*.50+ela*.18+copy*.14+noise*.10+edge*.08);
  score=Math.max(1,Math.min(99,score));
  const confidence=score>=70?'medium-high':score>=45?'medium':'low-medium';
  const label=score>=75?'Strong AI or synthetic-edit signal':score>=55?'Elevated AI or synthetic-edit signal':score>=30?'Some synthetic characteristics':'Low synthetic signal';
  return{score,confidence,label,whole:score>=88,reasons:m?.syntheticImageSignal?.reasons||[]};
}

function panelHtml(d,e){
  const m=d.multimodal||{},fp=(m?.metadata?.generatorFingerprints||[]).join(', '),name=selectedFile?.name||d?.file?.name||'Image';
  return `<section class="resultCard emetImageOriginPanel" data-image-origin-panel="1">
    <div class="emetImageHero"><div><div class="eyebrow">EMET IMAGE ORIGIN MAP</div><h2>${esc(e.score)}% AI origin estimate</h2><p>${esc(e.label)} · confidence ${esc(e.confidence)}.</p></div><div class="emetImagePct">${esc(e.score)}<small>%</small></div></div>
    <div class="emetImageStage"><canvas class="emetImageCanvas" aria-label="Image forensic attention map"></canvas><div class="emetLegend"><span><i class="whole"></i>whole-image origin signal</span><span><i class="local"></i>local forensic attention</span></div></div>
    <div class="emetImageSummary"><div><span>File</span><b>${esc(name)}</b></div><div><span>Generator fingerprint</span><b>${fp?esc(fp):'None found'}</b></div><div><span>Pixel / noise layer</span><b>${Math.round(Number(m?.syntheticImageSignal?.score||0))}/100</b></div><div><span>Recompression</span><b>${m?.recompression?.supported?Math.round(Number(m.recompression.recompressionAnomalyScore||0))+'/100':'N/A'}</b></div><div><span>Repeated-region screen</span><b>${Math.round(Number(m?.copyMove?.copyMoveSignal||0))}/100</b></div></div>
    ${e.reasons?.length?`<div class="whyBox"><b>Why EMET noticed this</b>${e.reasons.slice(0,6).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
    <details class="advanced"><summary>Image forensic details</summary><div class="detailList"><div><span>Dimensions</span><b>${esc(m?.dimensions?.width||'?')} × ${esc(m?.dimensions?.height||'?')}</b></div><div><span>Format</span><b>${esc(m?.dimensions?.format||'Unknown')}</b></div><div><span>Noise residual</span><b>${esc(m?.pixelForensics?.noiseResidual??'N/A')}</b></div><div><span>Edge energy</span><b>${esc(m?.pixelForensics?.edgeEnergy??'N/A')}</b></div><div><span>Entropy</span><b>${esc(m?.pixelForensics?.entropy??'N/A')}</b></div><div><span>OCR characters</span><b>${esc(m?.ocr?.characters??0)}</b></div></div></details>
    <p class="emetImageNote">Yellow marks the regions EMET considers most relevant for synthetic generation or local-edit review. If the evidence points to the whole image, the entire image is lightly marked.</p>
  </section>`;
}

async function drawMap(canvas,file,e){
  if(!canvas||!file)return;
  if(lastUrl){try{URL.revokeObjectURL(lastUrl);}catch{}}
  lastUrl=URL.createObjectURL(file);
  const img=new Image();img.decoding='async';img.src=lastUrl;
  await img.decode();
  const max=720,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
  const original=ctx.getImageData(0,0,w,h),data=original.data;
  const cols=10,rows=Math.max(7,Math.round(10*h/w)),tw=w/cols,th=h/rows,tiles=[];
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const x0=Math.floor(gx*tw),x1=Math.min(w,Math.ceil((gx+1)*tw)),y0=Math.floor(gy*th),y1=Math.min(h,Math.ceil((gy+1)*th));
    let n=0,sum=0,sum2=0,res=0,edge=0;
    for(let y=y0+1;y<y1-1;y+=3)for(let x=x0+1;x<x1-1;x+=3){
      const i=(y*w+x)*4,l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
      const il=(y*w+x-1)*4,iu=((y-1)*w+x)*4,ir=(y*w+x+1)*4,id=((y+1)*w+x)*4;
      const ll=.2126*data[il]+.7152*data[il+1]+.0722*data[il+2],lu=.2126*data[iu]+.7152*data[iu+1]+.0722*data[iu+2],lr=.2126*data[ir]+.7152*data[ir+1]+.0722*data[ir+2],ld=.2126*data[id]+.7152*data[id+1]+.0722*data[id+2];
      const avg=(ll+lr+lu+ld)/4;sum+=l;sum2+=l*l;res+=Math.abs(l-avg);edge+=Math.abs(l-ll)+Math.abs(l-lu);n++;
    }
    const mean=sum/(n||1),sd=Math.sqrt(Math.max(0,sum2/(n||1)-mean*mean)),r=res/(n||1),ed=edge/(2*(n||1));
    tiles.push({x0,y0,x1,y1,raw:r*.62+ed*.28+sd*.10});
  }
  const vals=tiles.map(t=>t.raw).sort((a,b)=>a-b),median=vals[Math.floor(vals.length*.5)]||1,p85=vals[Math.floor(vals.length*.85)]||median;
  ctx.putImageData(original,0,0);
  if(e.whole){ctx.fillStyle='rgba(255,220,72,.18)';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(236,176,0,.85)';ctx.lineWidth=Math.max(2,w/350);ctx.strokeRect(2,2,w-4,h-4);}
  else{
    const hot=tiles.filter(t=>t.raw>=p85&&t.raw>median*1.08).sort((a,b)=>b.raw-a.raw).slice(0,Math.max(5,Math.round(tiles.length*.14)));
    hot.forEach(t=>{const z=(t.raw-p85)/Math.max(1,p85),a=Math.min(.34,.14+z*.12);ctx.fillStyle=`rgba(255,218,70,${a})`;ctx.fillRect(t.x0,t.y0,t.x1-t.x0,t.y1-t.y0);ctx.strokeStyle='rgba(228,164,0,.72)';ctx.lineWidth=Math.max(1,w/700);ctx.strokeRect(t.x0+.5,t.y0+.5,t.x1-t.x0-1,t.y1-t.y0-1);});
  }
}

function renderImageResult(d){
  if(d!==lastImageScan)return;
  const results=$('#results');if(!results)return;
  const e=estimateImage(d.multimodal);
  results.innerHTML=panelHtml(d,e);
  const canvas=results.querySelector('.emetImageCanvas');
  if(selectedFile)drawMap(canvas,selectedFile,e).catch(err=>console.warn('EMET image map:',err));
  results.scrollIntoView({behavior:'smooth',block:'start'});
}
})();