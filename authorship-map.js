'use strict';
const {readDocx}=require('./evidence-document');
const {panelScores}=require('./ultimate-engine');

const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const cpLen=s=>Array.from(String(s||'')).length;
const words=s=>(String(s||'').match(/[\p{L}\p{M}\p{N}]+(?:['’״׳\-][\p{L}\p{M}\p{N}]+)*/gu)||[]).length;

function median(values){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function looksStructural(text){
  const s=String(text||'').trim();if(!s)return true;
  const wc=words(s);
  if(wc<5)return true;
  if(/\.{6,}\s*\d+\s*$/u.test(s))return true;
  const visible=[...s].filter(c=>!(/\s/u.test(c)));
  const letters=(s.match(/[\p{L}\p{M}]/gu)||[]).length;
  return visible.length>0&&letters/visible.length<0.35;
}
function paragraphCoordinates(doc,p){
  const startUTF16=Number.isInteger(p.startUTF16)?p.startUTF16:0;
  const endUTF16=Number.isInteger(p.endUTF16)?p.endUTF16:startUTF16+String(p.text||'').length;
  return {startCodePoint:cpLen(doc.text.slice(0,startUTF16)),endCodePoint:cpLen(doc.text.slice(0,endUTF16))};
}
function fingerprintStrength(p,fingerprintLab){
  const candidates=Array.isArray(fingerprintLab?.candidates)?fingerprintLab.candidates:[];
  const hits=candidates.filter(c=>{
    if(p.part==='word/document.xml'&&Number.isInteger(p.partParagraphIndex)&&Number(c.paragraphIndex)===p.partParagraphIndex)return true;
    return false;
  });
  return {strength:hits.length?Math.max(...hits.map(x=>Number(x.score)||0)):0,hits};
}
function contextFor(doc,index,minWords=220,maxWords=440){
  const target=doc.paragraphs[index];if(!target)return {text:'',words:0,indices:[]};
  const samePart=doc.paragraphs.map((p,i)=>({p,i})).filter(x=>x.p.part===target.part);
  const pos=samePart.findIndex(x=>x.i===index);if(pos<0)return {text:String(target.text||''),words:words(target.text),indices:[index]};
  let left=pos,right=pos,total=words(target.text),indices=[index];
  while(total<minWords&&(left>0||right<samePart.length-1)){
    const leftCandidate=left>0?samePart[left-1]:null,rightCandidate=right<samePart.length-1?samePart[right+1]:null;
    const lw=leftCandidate?words(leftCandidate.p.text):Infinity,rw=rightCandidate?words(rightCandidate.p.text):Infinity;
    const pickLeft=leftCandidate&&(!rightCandidate||lw<=rw);
    const next=pickLeft?leftCandidate:rightCandidate;if(!next)break;
    const nw=words(next.p.text);if(total+nw>maxWords&&total>=minWords)break;
    if(pickLeft)left--;else right++;
    total+=nw;indices.push(next.i);
  }
  indices.sort((a,b)=>a-b);
  const text=indices.map(i=>String(doc.paragraphs[i].text||'')).filter(Boolean).join('\n');
  return {text,words:words(text),indices};
}
function scoreParagraph({text,wc,local,context,documentStyle,process,editStrength}){
  const processScore=Number(process?.score||0),strong=process?.status==='strong_assembly_signal';
  let score=0;
  if(strong)score+=46;
  else if(process?.status==='assembly_review')score+=22;
  else score+=Math.min(18,processScore*.18);

  // The old engine was designed for long samples. Use a 220+ word neighbourhood
  // as the primary language signal instead of scoring a 15–40 word paragraph in isolation.
  score+=Number(context.localScore||0)*.36;
  score+=Number(documentStyle.localScore||0)*.14;
  if(wc>=90)score+=Number(local.localScore||0)*.10;

  const panels=context.panels||{};
  if(panels.predictability>=35)score+=5;
  if(panels.lexical>=35)score+=4;
  if(panels.rhythm>=35)score+=3;
  if(panels.discourse>=35)score+=3;
  if(panels.aiResidue>=100)score+=24;

  // A strong retained Word edit fingerprint is counter-evidence to a document-wide
  // generated-origin hypothesis for this local span, not proof that the words are human.
  score-=Math.min(32,Number(editStrength||0)*.34);
  return clamp(score);
}

function buildAuthorshipMap(file,aiAnalysis,fingerprintLab){
  const doc=readDocx(file);
  if(!doc)return {supported:false,reason:'AI origin mapping currently supports DOCX/DOCM and plain text through separate text analysis.'};
  const process=aiAnalysis?.assessment?.process||null;
  const processScore=Number(process?.score||0);
  const strongProcess=process?.status==='strong_assembly_signal';
  const documentStyle=panelScores(doc.text);
  const items=[];

  for(let i=0;i<doc.paragraphs.length;i++){
    const p=doc.paragraphs[i],text=String(p.text||'').trim(),wc=words(text);
    if(looksStructural(text))continue;
    const coords=paragraphCoordinates(doc,p);
    const local=panelScores(text);
    const ctx=contextFor(doc,i);
    const contextStyle=panelScores(ctx.text);
    const fp=fingerprintStrength(p,fingerprintLab);
    const score=scoreParagraph({text,wc,local,context:contextStyle,documentStyle,process,editStrength:fp.strength});

    let label='mixed_or_uncertain';
    const strongHumanEdit=fp.strength>=75;
    if(strongHumanEdit)label='human_edit_candidate';
    else if(score>=72)label='strong_ai_signal';
    else if(score>=48)label='likely_ai';
    else if(score>=30)label='mixed_or_uncertain';
    else label='low_ai_signal';

    items.push({
      paragraphIndex:p.index,part:p.part||null,partParagraphIndex:p.partParagraphIndex??null,
      ...coords,words:wc,text,score,label,
      signals:{
        processScore,
        paragraphStyleScore:Number(local.localScore||0),
        contextStyleScore:Number(contextStyle.localScore||0),
        documentStyleScore:Number(documentStyle.localScore||0),
        contextWords:ctx.words,
        predictability:contextStyle.panels?.predictability||0,
        lexical:contextStyle.panels?.lexical||0,
        rhythm:contextStyle.panels?.rhythm||0,
        discourse:contextStyle.panels?.discourse||0,
        aiResidue:contextStyle.panels?.aiResidue||0,
        humanEditCandidate:fp.strength,
        fingerprintHits:fp.hits.length
      },
      explanation: label==='human_edit_candidate'?'Word retained a strong local editing fingerprint at this paragraph; EMET treats it as counter-evidence to a document-wide generated-origin hypothesis.':
        label==='strong_ai_signal'?'Strong file-process evidence and the surrounding 220+ word language window point in the same generated-origin direction.':
        label==='likely_ai'?'The paragraph sits inside a longer language window consistent with the document-wide generated-origin pattern.':
        label==='mixed_or_uncertain'?'The file-level and local language signals do not align strongly enough for a high-confidence local attribution.':
        'This paragraph has weaker generated-origin signals than the surrounding document.'
    });
  }

  const aiLike=items.filter(x=>x.label==='strong_ai_signal'||x.label==='likely_ai');
  const humanLike=items.filter(x=>x.label==='human_edit_candidate');
  const weighted=items.reduce((s,x)=>s+x.words,0);
  const aiWords=aiLike.reduce((s,x)=>s+x.words,0);
  const itemScores=items.map(x=>x.score);
  const documentSignalScore=clamp((strongProcess?40:processScore*.30)+(documentStyle.localScore||0)*.32+median(itemScores)*.28);

  return {
    supported:true,
    version:'EMET-AI-ORIGIN-MAP-2026.09.12.2',
    method:'multi-scale local evidence fusion: DOCX process fingerprint + 220–440 word context windows + document stylometry + Word run fingerprints; not a calibrated probability',
    documentSignalScore,
    paragraphsMapped:items.length,
    estimatedAIShare:weighted?Math.round(aiWords/weighted*100):0,
    strongFileProcessEvidence:strongProcess,
    processScore,
    fingerprintUsed:Boolean(fingerprintLab?.supported),
    fingerprintCoverage:Number(fingerprintLab?.runSessionTraceCoverage||0),
    counts:{
      strongAI:items.filter(x=>x.label==='strong_ai_signal').length,
      likelyAI:items.filter(x=>x.label==='likely_ai').length,
      humanEditCandidates:humanLike.length,
      mixed:items.filter(x=>x.label==='mixed_or_uncertain').length,
      low:items.filter(x=>x.label==='low_ai_signal').length
    },
    items,
    limitation:'The map now analyses long context windows so short Hebrew paragraphs are not automatically scored as zero, and it fuses retained Word run fingerprints when available. It is still an evidence score, not mathematical proof of who typed every word.'
  };
}

module.exports={buildAuthorshipMap,contextFor,scoreParagraph,looksStructural};
