const sharp=require('sharp');

const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const round=(n,d=2)=>{const p=10**d;return Math.round((Number(n)||0)*p)/p};
const median=a=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2};
const mad=a=>{const m=median(a);return median(a.map(x=>Math.abs(x-m)))||1e-6};

async function rgbImage(buffer,max=704){
  const base=sharp(buffer,{failOn:'none'}).rotate();
  const meta=await base.metadata();
  const scale=Math.min(1,max/Math.max(meta.width||1,meta.height||1));
  const width=Math.max(8,Math.round((meta.width||1)*scale)),height=Math.max(8,Math.round((meta.height||1)*scale));
  const {data,info}=await base.resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
  return{data,width:info.width,height:info.height,meta};
}

function lumAt(data,i){return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2]}
function tileFeatures(img,x0,y0,x1,y1,step=2){
  const {data,width,height}=img;let n=0,sum=0,sum2=0,hp=0,hp2=0,edge=0,chroma=0,grid8=0,gridN=0;
  const hist=new Array(32).fill(0);
  for(let y=Math.max(1,y0+1);y<Math.min(height-1,y1-1);y+=step){
    for(let x=Math.max(1,x0+1);x<Math.min(width-1,x1-1);x+=step){
      const i=(y*width+x)*3,l=lumAt(data,i),il=(y*width+x-1)*3,ir=(y*width+x+1)*3,iu=((y-1)*width+x)*3,id=((y+1)*width+x)*3;
      const ll=lumAt(data,il),lr=lumAt(data,ir),lu=lumAt(data,iu),ld=lumAt(data,id),avg=(ll+lr+lu+ld)/4,r=l-avg;
      const gx=Math.abs(l-lr),gy=Math.abs(l-ld);
      sum+=l;sum2+=l*l;hp+=Math.abs(r);hp2+=r*r;edge+=gx+gy;chroma+=Math.abs(data[i]-data[i+1])+Math.abs(data[i+2]-data[i+1]);
      hist[Math.min(31,Math.floor(l/8))]++;n++;
      if(x%8===0||y%8===0){grid8+=gx+gy;gridN++;}
    }
  }
  const mean=sum/(n||1),variance=Math.max(0,sum2/(n||1)-mean*mean);let entropy=0;for(const c of hist)if(c){const p=c/(n||1);entropy-=p*Math.log2(p)}
  return{mean,std:Math.sqrt(variance),highPass:hp/(n||1),highPassRms:Math.sqrt(hp2/(n||1)),edge:edge/(2*(n||1)),chroma:chroma/(2*(n||1)),entropy,grid8:grid8/(2*(gridN||1))};
}

function robustScores(tiles,key){
  const vals=tiles.map(t=>t.f[key]),m=median(vals),scale=1.4826*mad(vals)+1e-6;
  for(const t of tiles)t.z[key]=(t.f[key]-m)/scale;
  return{median:m,mad:scale/1.4826};
}

function gridPass(img,cols,rows){
  const tw=img.width/cols,th=img.height/rows,tiles=[];
  for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
    const x0=Math.floor(gx*tw),x1=Math.ceil((gx+1)*tw),y0=Math.floor(gy*th),y1=Math.ceil((gy+1)*th);
    tiles.push({gx,gy,x0,y0,x1,y1,f:tileFeatures(img,x0,y0,x1,y1),z:{}});
  }
  ['highPass','edge','chroma','entropy','std','grid8'].forEach(k=>robustScores(tiles,k));
  for(const t of tiles){
    const noiseMismatch=Math.abs(t.z.highPass),edgeMismatch=Math.abs(t.z.edge),chromaMismatch=Math.abs(t.z.chroma),entropyMismatch=Math.abs(t.z.entropy),gridMismatch=Math.max(0,t.z.grid8);
    const edgeNoiseMismatch=Math.abs(t.z.edge-t.z.highPass);
    t.score=clamp(Math.round(12+noiseMismatch*16+edgeMismatch*10+chromaMismatch*8+entropyMismatch*7+gridMismatch*7+edgeNoiseMismatch*12));
  }
  return tiles;
}

function mergeScales(img,passes){
  const baseCols=16,baseRows=Math.max(10,Math.round(baseCols*img.height/img.width)),cells=[];
  for(let gy=0;gy<baseRows;gy++)for(let gx=0;gx<baseCols;gx++){
    const cx=(gx+.5)/baseCols,cy=(gy+.5)/baseRows,scores=[];
    for(const pass of passes){const t=pass.find(q=>cx>=q.x0/img.width&&cx<=q.x1/img.width&&cy>=q.y0/img.height&&cy<=q.y1/img.height);if(t)scores.push(t.score)}
    const score=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):0;cells.push({gx,gy,score,x:gx/baseCols,y:gy/baseRows,w:1/baseCols,h:1/baseRows});
  }
  return{cols:baseCols,rows:baseRows,cells};
}

function connectedRegions(map,threshold){
  const {cols,rows,cells}=map,index=(x,y)=>y*cols+x,seen=new Set(),regions=[];
  for(const c of cells){if(c.score<threshold||seen.has(index(c.gx,c.gy)))continue;const stack=[[c.gx,c.gy]],group=[];seen.add(index(c.gx,c.gy));
    while(stack.length){const [x,y]=stack.pop(),cc=cells[index(x,y)];group.push(cc);for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){if(nx<0||ny<0||nx>=cols||ny>=rows)continue;const ii=index(nx,ny);if(!seen.has(ii)&&cells[ii].score>=threshold){seen.add(ii);stack.push([nx,ny]);}}}
    if(group.length<2)continue;const x=Math.min(...group.map(q=>q.x)),y=Math.min(...group.map(q=>q.y)),x2=Math.max(...group.map(q=>q.x+q.w)),y2=Math.max(...group.map(q=>q.y+q.h)),score=Math.round(group.reduce((s,q)=>s+q.score,0)/group.length);regions.push({x:round(x,4),y:round(y,4),w:round(x2-x,4),h:round(y2-y,4),score,cells:group.length});
  }
  return regions.sort((a,b)=>b.score-a.score).slice(0,12);
}

function cameraEvidence(meta){
  const fields=[meta.make,meta.model,meta.lens,meta.exposureTime,meta.fNumber,meta.iso,meta.focalLength,meta.dateTimeOriginal].filter(v=>v!==undefined&&v!==null&&v!=='');
  const score=clamp(fields.length*10+(meta.make&&meta.model?15:0)+(meta.exposureTime&&meta.iso?10:0));
  return{score,fieldsPresent:fields.length,make:meta.make||null,model:meta.model||null};
}

function fusion(existing,global,regions,camera){
  const gen=(existing?.metadata?.generatorFingerprints||[]).length?100:0;
  const base=Number(existing?.syntheticImageSignal?.score||0),ela=Number(existing?.recompression?.recompressionAnomalyScore||0),copy=Number(existing?.copyMove?.copyMoveSignal||0);
  const regionStrength=regions.length?Math.round(regions.slice(0,5).reduce((s,r)=>s+r.score,0)/Math.min(5,regions.length)):0;
  const lowNoise=global.highPass<2.2&&global.edge>6?62:global.highPass<3?38:12;
  const gridAnomaly=global.grid8>global.edge*1.18?58:18;
  const signals=[
    {id:'provenance_generator',score:gen,weight:.30,kind:'ai'},
    {id:'existing_local_forensics',score:base,weight:.18,kind:'ai'},
    {id:'regional_inconsistency',score:regionStrength,weight:.18,kind:'edit'},
    {id:'recompression',score:ela,weight:.10,kind:'edit'},
    {id:'copy_move',score:copy,weight:.08,kind:'edit'},
    {id:'noise_model',score:lowNoise,weight:.10,kind:'ai'},
    {id:'grid_periodicity',score:gridAnomaly,weight:.06,kind:'edit'}
  ];
  let weighted=0,total=0;for(const s of signals){weighted+=s.score*s.weight;total+=s.weight}let score=weighted/(total||1);
  score-=camera.score*.12; if(gen)score=Math.max(score,96); score=clamp(Math.round(score));
  const active=signals.filter(s=>s.score>=55).length,agreement=clamp(Math.round(active/Math.max(1,signals.length)*100));
  const confidence=gen?'very high':agreement>=55?'high':agreement>=35?'medium':'low';
  return{score,confidence,agreement,signals,cameraEvidence:camera,regionStrength};
}

async function analyzeAdvancedImage(buffer,existing={}){
  const img=await rgbImage(buffer,704),global=tileFeatures(img,0,0,img.width,img.height,2);
  const passes=[gridPass(img,8,Math.max(6,Math.round(8*img.height/img.width))),gridPass(img,12,Math.max(8,Math.round(12*img.height/img.width))),gridPass(img,16,Math.max(10,Math.round(16*img.height/img.width)))];
  const heatmap=mergeScales(img,passes),scores=heatmap.cells.map(c=>c.score),threshold=Math.max(58,Math.round(median(scores)+1.4*1.4826*mad(scores))),regions=connectedRegions(heatmap,threshold);
  const camera=cameraEvidence(img.meta),fused=fusion(existing,global,regions,camera);
  const wholeImage=fused.score>=82&&fused.regionStrength<70;
  return{version:'EMET-VISION-FUSION-2026.09.13',dimensions:{width:img.meta.width||img.width,height:img.meta.height||img.height},aiOriginEstimate:fused,localization:{mode:wholeImage?'whole_image':'regional_attention',threshold,regions,heatmap},globalForensics:{highPass:round(global.highPass,3),highPassRms:round(global.highPassRms,3),edge:round(global.edge,3),chroma:round(global.chroma,3),entropy:round(global.entropy,3),grid8:round(global.grid8,3)},method:['multi-scale patch residuals','edge/noise disagreement','chroma consistency','local entropy','8px periodicity','recompression signal','copy-move screen','generator metadata','camera-capture evidence'],note:'The percentage is an EMET evidence-fusion estimate. Exact 100% verification is reserved for authenticated provenance, durable watermark matches, or known ground-truth identity.'};
}
module.exports={analyzeAdvancedImage};
