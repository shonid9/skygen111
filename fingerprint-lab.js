const path=require('path');
const crypto=require('crypto');
const AdmZip=require('adm-zip');
const {panelScores}=require('./ultimate-engine');

const cpLen=s=>[...String(s||'')].length;
const clamp=(n,a=0,b=100)=>Math.max(a,Math.min(b,n));
const decode=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
const attr=(s,name)=>{const escaped=name.replace(':','\\:');const m=String(s||'').match(new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`,'i'))||String(s||'').match(new RegExp(`(?:^|\\s)(?:\\w+:)?${name.split(':').pop()}="([^"]*)"`,'i'));return m?decode(m[1]):null};
const tagText=(xml,tag)=>[...String(xml||'').matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'gi'))].map(m=>decode(m[1].replace(/<[^>]+>/g,''))).join('');
const sha=s=>crypto.createHash('sha1').update(String(s||'')).digest('hex').slice(0,12);
const words=s=>(String(s||'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length;

function styleOf(runBody){
  const rpr=(String(runBody).match(/<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/i)||[])[1]||'';
  const val=n=>{const m=rpr.match(new RegExp(`<w:${n}\\b([^>]*)\\/?>(?:<\\/w:${n}>)?`,'i'));return m?(attr(m[1],'w:val')||attr(m[1],'val')||true):null};
  return {
    bold:Boolean(/<w:b\b/i.test(rpr)),italic:Boolean(/<w:i\b/i.test(rpr)),underline:val('u'),strike:Boolean(/<w:strike\b/i.test(rpr)),
    size:val('sz'),color:val('color'),font:(rpr.match(/<w:rFonts\b([^>]*)/i)||[])[1]?attr((rpr.match(/<w:rFonts\b([^>]*)/i)||[])[1],'w:ascii'):null,
    lang:(rpr.match(/<w:lang\b([^>]*)/i)||[])[1]?attr((rpr.match(/<w:lang\b([^>]*)/i)||[])[1],'w:val'):null,
    rtl:Boolean(/<w:rtl\b/i.test(rpr)),noProof:Boolean(/<w:noProof\b/i.test(rpr)),vanish:Boolean(/<w:vanish\b/i.test(rpr))
  };
}
function styleHash(style){return sha(JSON.stringify(style))}
function inside(body,index,tag){return body.lastIndexOf(`<${tag}`,index)>body.lastIndexOf(`</${tag}>`,index)}

function parseDocx(file){
  const ext=path.extname(file.originalname||'').toLowerCase();
  if(!['.docx','.docm'].includes(ext))return null;
  const zip=new AdmZip(file.buffer),entry=zip.getEntry('word/document.xml');
  if(!entry)return null;
  const xml=entry.getData().toString('utf8');
  const paragraphs=[];let globalCp=0,plain=[];
  for(const pm of xml.matchAll(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/gi)){
    const pAttrs=pm[1]||'',body=pm[2]||'',pIndex=paragraphs.length;
    const paraId=attr(pAttrs,'w14:paraId')||attr(pAttrs,'paraId');
    const paraRsid=attr(pAttrs,'w:rsidR')||attr(pAttrs,'rsidR');
    const pStyle=((body.match(/<w:pStyle\b([^>]*)/i)||[])[1]&&attr((body.match(/<w:pStyle\b([^>]*)/i)||[])[1],'w:val'))||null;
    const runs=[];let pText='';
    for(const rm of body.matchAll(/<w:r\b([^>]*)>([\s\S]*?)<\/w:r>/gi)){
      const rAttrs=rm[1]||'',rBody=rm[2]||'';
      let text=tagText(rBody,'w:t')+tagText(rBody,'w:delText');
      if(/<w:tab\b/i.test(rBody))text+='\t';
      if(/<w:br\b/i.test(rBody))text+='\n';
      if(!text)continue;
      const startCp=globalCp+cpLen(pText),endCp=startCp+cpLen(text),style=styleOf(rBody),runIndex=runs.length;
      const runRsid=attr(rAttrs,'w:rsidR')||attr(rAttrs,'rsidR'),rsidRPr=attr(rAttrs,'w:rsidRPr')||attr(rAttrs,'rsidRPr');
      const relIndex=rm.index||0;
      runs.push({paragraphIndex:pIndex,runIndex,text,startCp,endCp,paraId,paragraphRsid:paraRsid,runRsid,rsidRPr,effectiveRsid:runRsid||paraRsid||null,style,styleHash:styleHash(style),trackedInsert:inside(body,relIndex,'w:ins'),trackedDelete:inside(body,relIndex,'w:del')});
      pText+=text;
    }
    paragraphs.push({index:pIndex,paraId,paragraphRsid:paraRsid,pStyle,text:pText,startCp:globalCp,endCp:globalCp+cpLen(pText),runs});
    plain.push(pText);globalCp+=cpLen(pText)+1;
  }
  return {paragraphs,text:plain.join('\n')};
}

function candidateScore(run,para,allRuns,rsidFreq,styleFreq){
  let score=0;const evidence=[];const prev=para.runs[run.runIndex-1],next=para.runs[run.runIndex+1],wc=words(run.text),short=wc>0&&wc<=7;
  if(run.trackedInsert||run.trackedDelete){score+=80;evidence.push(run.trackedInsert?'Word stores this run as a tracked insertion.':'Word stores this run as a tracked deletion.');}
  if(run.runRsid&&rsidFreq.get(run.runRsid)<=2){score+=30;evidence.push('This run carries a rare Word editing-session identifier.');}
  if(prev&&next&&short){
    const neighborRsid=prev.effectiveRsid&&prev.effectiveRsid===next.effectiveRsid?prev.effectiveRsid:null;
    if(neighborRsid&&run.effectiveRsid&&run.effectiveRsid!==neighborRsid){score+=35;evidence.push('The words sit between two runs from another editing session.');}
    if(prev.styleHash===next.styleHash&&run.styleHash!==prev.styleHash){score+=24;evidence.push('The words form an isolated formatting/run fingerprint between matching neighbors.');}
    if(prev.style.lang===next.style.lang&&run.style.lang&&run.style.lang!==prev.style.lang){score+=18;evidence.push('The run language property differs from both surrounding runs.');}
    if(prev.style.noProof===next.style.noProof&&run.style.noProof!==prev.style.noProof){score+=15;evidence.push('Proofing metadata changes only for this local run.');}
  }
  if(para.runs.length>=3&&short&&styleFreq.get(run.styleHash)<=2){score+=10;evidence.push('The run fingerprint is rare inside this paragraph.');}
  const atStart=run.runIndex===0,looksLabel=/[:：]\s*$/.test(run.text.trim())||run.style.bold||run.style.italic;
  if(atStart&&looksLabel){score-=22;evidence.push('Formatting resembles an intentional heading or label, so the edit score was reduced.');}
  if(wc>18)score-=12;
  return {score:clamp(score),evidence};
}

function mergeCandidates(items){
  const out=[];
  for(const c of items.sort((a,b)=>a.startCp-b.startCp)){
    const last=out[out.length-1];
    if(last&&c.paragraphIndex===last.paragraphIndex&&c.startCp-last.endCp<=1&&Math.abs(c.score-last.score)<=20){last.text+=c.text;last.endCp=c.endCp;last.score=Math.max(last.score,c.score);last.evidence=[...new Set([...last.evidence,...c.evidence])];last.runEnd=c.runIndex;continue;}
    out.push({...c,runEnd:c.runIndex});
  }
  return out;
}

function analyzeFingerprintFile(file){
  const doc=parseDocx(file);
  if(!doc)return {supported:false,reason:'Span-level Word fingerprinting currently requires DOCX or DOCM.'};
  const allRuns=doc.paragraphs.flatMap(p=>p.runs),rsidFreq=new Map(),styleFreq=new Map();
  for(const r of allRuns){if(r.runRsid)rsidFreq.set(r.runRsid,(rsidFreq.get(r.runRsid)||0)+1);styleFreq.set(r.styleHash,(styleFreq.get(r.styleHash)||0)+1);}
  const raw=[];
  for(const p of doc.paragraphs){
    if(!p.text.trim())continue;
    for(const r of p.runs){const x=candidateScore(r,p,allRuns,rsidFreq,styleFreq);if(x.score>=40){const context=p.text.length>220?p.text.slice(0,217)+'…':p.text;raw.push({...r,score:x.score,evidence:x.evidence,context});}}
  }
  const candidates=mergeCandidates(raw).sort((a,b)=>b.score-a.score||a.startCp-b.startCp).slice(0,60).map(c=>({
    id:sha(`${file.originalname}|${c.paragraphIndex}|${c.runIndex}|${c.startCp}|${c.endCp}|${c.text}`),text:c.text,paragraphIndex:c.paragraphIndex,runStart:c.runIndex,runEnd:c.runEnd,startCodePoint:c.startCp,endCodePoint:c.endCp,paraId:c.paraId||null,score:c.score,confidence:c.score>=75?'high':c.score>=55?'medium':'low',evidence:c.evidence,context:c.context,features:{runRsid:c.runRsid||null,paragraphRsid:c.paragraphRsid||null,rsidRPr:c.rsidRPr||null,style:c.style,trackedInsert:c.trackedInsert,trackedDelete:c.trackedDelete}
  }));
  const baseline=panelScores(doc.text),runsWithSession=allRuns.filter(r=>r.effectiveRsid).length,coverage=allRuns.length?Math.round(runsWithSession/allRuns.length*100):0;
  return {supported:true,version:'EMET-FINGERPRINT-LAB-2026.09.12',language:baseline.language,baselineAIStyleScore:baseline.localScore,paragraphs:doc.paragraphs.length,runs:allRuns.length,runSessionTraceCoverage:coverage,uniqueRunSessions:rsidFreq.size,candidateCount:candidates.length,candidates,interpretation:coverage>=35?'Word retained enough run/session structure to support local edit hypotheses.':'Word retained limited run/session structure. Exact word attribution may depend mostly on tracked changes or isolated run fingerprints.',locator:{representation:'unicode_code_points',docx:['paragraphIndex','runStart','runEnd','paraId']},trainingReady:true};
}

module.exports={analyzeFingerprintFile,parseDocx};
