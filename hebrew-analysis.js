'use strict';
const crypto=require('node:crypto');
const {academicContext}=require('./academic-context');
const {wordSpans,scriptLanguage}=require('./evidence-text');
const {validateDetectorModel,scoreDetector}=require('./hebrew-cohort');
const VERSION='EMET-HEBREW-CONTEXT-2026.10.03';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
let cachedRaw,cachedModel,cachedStatus;
function configuredModel(){
  const raw=process.env.EMET_HEBREW_COHORT_MODEL||'';
  if(raw!==cachedRaw){
    cachedRaw=raw;cachedModel=null;cachedStatus='not_configured';
    if(raw){
      try{
        const m=JSON.parse(raw);
        validateDetectorModel(m);
        // Only deploy reviewed, numeric artifacts; corpus source IDs never leave the private workspace.
        if(m.train_source_ids.length)throw new Error('Private training IDs are not deployable.');
        cachedModel=m;cachedStatus='experimental';
      }catch{cachedStatus='invalid_artifact';}
    }
  }
  return {model:cachedModel,status:cachedStatus,artifactSHA256:cachedModel?hash(raw):null};
}
function cohortStatus(){const c=configuredModel();return {status:c.status,version:c.model?.version||null,artifactSHA256:c.artifactSHA256,trained:Boolean(c.model),validatedLanguages:[],calibratedProbabilityAvailable:false,genericAIDetectionValidated:false,minimumHebrewWords:500};}
const normal=s=>s.normalize('NFKC').replace(/[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g,'').toLowerCase();
function distribution(a){
  if(!a.length)return {count:0,mean:null,median:null,coefficientOfVariation:null};
  const mean=a.reduce((n,x)=>n+x,0)/a.length,sorted=[...a].sort((a,b)=>a-b),mid=Math.floor(a.length/2);
  return {count:a.length,mean:+mean.toFixed(3),median:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,coefficientOfVariation:mean?+(Math.sqrt(a.reduce((n,x)=>n+(x-mean)**2,0)/a.length)/mean).toFixed(3):null};
}
const FUNCTION_WORDS=new Set('בנוסף ולכן לכן כמו כן לפיכך עם זאת כי או אם גם אך אבל של על ידי את זה זו הוא היא הם הן אשר כאשר כדי חשוב לציין לסיכום מכאן יתרה מכך בהתאם'.split(' '));
function repeatedPhrases(text){
  const found=new Map();
  // Never join a phrase across a heading, excluded span, line or paragraph.
  for(const line of text.matchAll(/[^\r\n]+/g)){
    const ws=wordSpans(line[0]);
    for(let i=0;i+8<=ws.length;i++){
      const span=ws.slice(i,i+8),key=span.map(w=>normal(w.text)).join(' ');
      if(new Set(key.split(' ').filter(w=>!FUNCTION_WORDS.has(w))).size<5)continue;
      const start=line.index+span[0].start,end=line.index+span.at(-1).end;
      const row=found.get(key)||{count:0,locators:[]};row.count++;
      if(row.locators.length<3)row.locators.push({startUTF16:start,endUTF16:end});
      found.set(key,row);
    }
  }
  return [...found.values()].filter(x=>x.count>=2).sort((a,b)=>b.count-a.count).slice(0,8);
}
function analyzeHebrew(text){
  if(scriptLanguage(text).code!=='he')return {version:VERSION,status:'not_applicable'};
  const c=academicContext(text),ws=wordSpans(c.body),prose=c.body;
  const sentenceLengths=prose.split(/[.!?。！？]+/u).map(s=>wordSpans(s).length).filter(Boolean);
  const paragraphLengths=prose.split(/\r?\n+/).map(s=>wordSpans(s).length).filter(Boolean);
  const tokens=ws.map(w=>normal(w.text)),unique=new Set(tokens),hebrewLetters=(prose.match(/[\u05d0-\u05ea]/g)||[]).length;
  const punctuation=Object.fromEntries(['.',',',';',':','?','!','—','–','(',')','״','"'].map(k=>[k,prose.split(k).length-1]));
  const niqqud=(prose.match(/[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g)||[]).length;
  const repeated=repeatedPhrases(prose).map(r=>({...r,quote:text.slice(r.locators[0].startUTF16,r.locators[0].endUTF16)}));
  const conf=configuredModel();
  const originalWords=wordSpans(text).filter(w=>/[\u05d0-\u05ea]/u.test(w.text));
  const markedWords=originalWords.filter(w=>/[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/u.test(w.text)).length;
  const score=originalWords.length<500?{status:'insufficient_text',minimum_hebrew_words:500,ai_probability:null}:markedWords/originalWords.length>.05?{status:'unsupported_niqqud_tokenization',ai_probability:null}:conf.model?scoreDetector(text,conf.model):null;
  // Keep pilot preprocessing exactly as trained. Filtering would shift its distribution and invalidate parity.
  const cohort=conf.model?{...score,artifactSHA256:conf.artifactSHA256,evaluation:{holdout:conf.model.report.holdout?.confusion||null,falsePositiveWilson95CI:conf.model.report.binomial_wilson_95ci?.human_false_positive_rate||null},scope:'Original text, matching the frozen pilot preprocessing; not the separately filtered prose profile.',outOfDistribution:{status:'not_validated',reason:'Contemporary human student writing, edited/mixed AI, new topics and generators were not validated.'}}:{status:conf.status,ai_probability:null};
  return {version:VERSION,status:'completed',sourceHash:hash(text),analyzedAt:new Date().toISOString(),context:{...c.summary,examples:c.exclusions.slice(0,12).map(e=>({rule:e.rule,reason:e.reason,quote:text.slice(e.start,e.end).trim(),startUTF16:e.start,endUTF16:e.end}))},
    profile:{proseWords:ws.length,uniqueWords:unique.size,lexicalDiversity:ws.length?+(unique.size/ws.length).toFixed(4):null,sentenceLengths:distribution(sentenceLengths),paragraphLengths:distribution(paragraphLengths),punctuation,niqqudPer1000Letters:hebrewLetters?+(niqqud/hebrewLetters*1000).toFixed(3):0,repeatedLongPhrases:repeated},
    cohort,probabilityAI:null,canProve:false,notice:{he:'פרופיל הניסוח מתאר משפטים, פסקאות, ניקוד וחזרות בגוף הטקסט. כותרות ומקורות מופרדים. מדד קבוצות הניסוי אינו אחוז AI, וחזרה על ניסוח אינה מעידה לבדה על שימוש בבינה מלאכותית.',en:'The prose profile measures sentences, paragraphs, niqqud and repetition after separating structural material. Cohort similarity is not AI probability. Repetition alone does not establish AI use.'}};
}
function profileSnapshot(assessment){
  const h=assessment?.hebrewAnalysis;if(h?.status!=='completed')return null;
  // No source text, quotations, student IDs or whole corpus in scan memory.
  const {repeatedLongPhrases,...profile}=h.profile;
  return {version:h.version,sourceHash:h.sourceHash,analyzedAt:h.analyzedAt,context:{version:h.context.version,excluded_lines:h.context.excluded_lines,reasons:h.context.reasons},profile,cohort:{status:h.cohort.status,version:h.cohort.version||null,artifactSHA256:h.cohort.artifactSHA256||null,cohort_score:h.cohort.cohort_score??null,ai_probability:null},automaticallyAddedToTraining:false};
}
module.exports={VERSION,analyzeHebrew,cohortStatus,profileSnapshot};
