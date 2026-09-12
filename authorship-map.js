'use strict';
const {readDocx}=require('./evidence-document');
const {panelScores}=require('./ultimate-engine');

const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
const words=s=>(String(s||'').match(/[\p{L}\p{M}\p{N}]+(?:['’״׳\-][\p{L}\p{M}\p{N}]+)*/gu)||[]).length;

function overlap(a,b){return Math.max(a.startCodePoint,b.startCodePoint)<Math.min(a.endCodePoint,b.endCodePoint)}

function buildAuthorshipMap(file,aiAnalysis,fingerprintLab){
  const doc=readDocx(file);
  if(!doc)return {supported:false,reason:'AI origin mapping currently supports DOCX/DOCM and plain text through separate text analysis.'};
  const process=aiAnalysis?.assessment?.process||null;
  const processScore=Number(process?.score||0);
  const strongProcess=process?.status==='strong_assembly_signal';
  const editCandidates=(fingerprintLab?.candidates||[]).map(c=>({
    startCodePoint:Number(c.startCodePoint),endCodePoint:Number(c.endCodePoint),score:Number(c.score||0),text:c.text||''
  }));
  const items=[];
  let globalCp=0;
  for(const p of doc.paragraphs){
    const text=String(p.text||'').trim();
    const startCodePoint=globalCp;
    const endCodePoint=startCodePoint+[...String(p.text||'')].length;
    globalCp=endCodePoint+2;
    const wc=words(text);
    if(wc<5)continue;
    const style=panelScores(text);
    const local=Number(style.localScore||0);
    const editHits=editCandidates.filter(c=>overlap({startCodePoint,endCodePoint},c));
    const editStrength=editHits.length?Math.max(...editHits.map(x=>x.score)):0;
    let score=local*.48;
    if(strongProcess)score+=38;
    else score+=processScore*.24;
    if(wc>=30)score+=5;
    if(style.panels?.predictability>=35)score+=7;
    if(style.panels?.lexical>=35)score+=5;
    if(style.panels?.rhythm>=35)score+=4;
    if(style.panels?.aiResidue>=100)score+=28;
    score-=editStrength*.28;
    score=clamp(score);
    let label='uncertain';
    if(editStrength>=70)label='human_edit_candidate';
    else if(score>=72)label='strong_ai_signal';
    else if(score>=55)label='likely_ai';
    else if(score>=38)label='mixed_or_uncertain';
    else label='low_ai_signal';
    items.push({
      paragraphIndex:p.index,startCodePoint,endCodePoint,words:wc,text,score,label,
      signals:{processScore,localStyleScore:local,predictability:style.panels?.predictability||0,lexical:style.panels?.lexical||0,rhythm:style.panels?.rhythm||0,aiResidue:style.panels?.aiResidue||0,humanEditCandidate:editStrength},
      explanation: label==='human_edit_candidate'?'Word retained a strong local edit fingerprint here.':
        label==='strong_ai_signal'?'The paragraph combines strong file-process evidence with multiple local generative-style signals.':
        label==='likely_ai'?'The paragraph is consistent with the document-level generative pattern and local writing signals.':
        label==='mixed_or_uncertain'?'The paragraph contains mixed signals and should be reviewed in context.':
        'This paragraph has weaker AI-origin signals than the surrounding document.'
    });
  }
  const aiLike=items.filter(x=>x.label==='strong_ai_signal'||x.label==='likely_ai');
  const humanLike=items.filter(x=>x.label==='human_edit_candidate');
  const weighted=items.reduce((s,x)=>s+x.words,0);
  const aiWords=aiLike.reduce((s,x)=>s+x.words,0);
  return {
    supported:true,version:'EMET-AI-ORIGIN-MAP-2026.09.12',method:'local evidence fusion; not a calibrated probability',
    documentSignalScore:clamp((processScore*.62)+(Number(aiAnalysis?.diagnostics?.localScore||0)*.38)),
    paragraphsMapped:items.length,estimatedAIShare:weighted?Math.round(aiWords/weighted*100):0,
    strongFileProcessEvidence:strongProcess,processScore,
    counts:{strongAI:items.filter(x=>x.label==='strong_ai_signal').length,likelyAI:items.filter(x=>x.label==='likely_ai').length,humanEditCandidates:humanLike.length,mixed:items.filter(x=>x.label==='mixed_or_uncertain').length,low:items.filter(x=>x.label==='low_ai_signal').length},
    items,
    limitation:'This map identifies the strongest AI-origin and human-edit signals retained in the file. It is an evidence-based attribution map, not mathematical proof of who typed every word.'
  };
}
module.exports={buildAuthorshipMap};
