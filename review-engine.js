'use strict';
const path=require('node:path');
const {VERSION,inspectText,assess}=require('./evidence-text');
const {readDocx}=require('./evidence-document');
const {readProvenance}=require('./provenance-reader');
const TEXT=new Set(['.txt','.md','.csv','.json','.xml','.html','.htm','.js','.ts','.tsx','.jsx','.py','.java','.c','.cpp','.cs','.go','.rs','.php','.rb','.sql','.sh','.yaml','.yml']);
function resultFor(text,doc=null){
  const inspected=inspectText(text,doc?.paragraphs),assessment=assess(inspected);
  assessment.documentCoverage=doc?.coverage||null;
  assessment.discourseCount=inspected.discourse.count;
  assessment.metadata=doc?.metadata||{};
  assessment.revisions=doc?.revisions||[];
  if(doc)assessment.checks.unshift({id:'word_structure',status:'completed'},{id:'stored_revisions',status:'completed'});
  return {version:VERSION,final:{verdict:assessment.ai.status==='self_reported'?'AI_USE_DISCLOSED':assessment.ai.status==='content_signal'?'AI_RESIDUE_FOUND':'CLASSIFIER_NOT_CONFIGURED',confidence:assessment.ai.status==='self_reported'?'self-reported':'not calibrated',canProve:false,reason:assessment.explanation.en,evidenceGrade:assessment.ai.status==='self_reported'?'document statement':'observations only'},assessment,providers:[],provenance:{c2pa:{status:doc?'unsupported':'not_applicable',manifestPresent:false,validationPassed:false}},local:{ensemble:{score:null,language:inspected.language.code,panels:{},metrics:{words:inspected.words,discourseMarkers:inspected.discourse.count}},style:{language:inspected.language.code,panels:{}},fileForensics:{...doc?.metadata,trackedRevisionMarkers:doc?.revisions?.length??0,hiddenTextProperties:doc?.hiddenTextCount??0,processScore:null},manipulation:{}},segments:{local:[]},coverage:inspected.coverage,limitations:['No text classifier has been trained and calibrated for this deployment.','A declaration is a document statement, not independently verified authorship.','Absence of retained edits is not evidence of AI creation.']};
}
function diagnostics(r,text){
  const old=require('./ultimate-engine').panelScores(text);
  // Retain legacy measurements for investigation only. They are not probabilities.
  const discourse=r.assessment.wordCount?Math.min(100,Math.round((r.assessment.discourseCount||0)/r.assessment.wordCount*1000)):0;
  old.panels.discourse=discourse;
  r.diagnostics={status:'uncalibrated',legacyVersion:'EMET-AI-ULTIMATE-2026.09.12',...old};
  r.local.ensemble={...r.local.ensemble,panels:old.panels,metrics:old.metrics};
  r.local.style={...r.local.style,panels:old.panels};
  return r;
}
async function analyzeAIText(text){text=String(text||'');return diagnostics(resultFor(text),text);}
function sourceClaim(r) {
  const c=r.provenance.c2pa;r.assessment.provenance=c;
  if(c?.trusted&&c?.aiDeclared){
    r.assessment.ai.status='authenticated_source_claim';
    r.assessment.title={en:'A signed claim declares AI involvement',he:'הצהרת מקור חתומה מדווחת על מעורבות בינה מלאכותית'};
    r.assessment.explanation={en:'The SDK validated the signed claim and its signer trust. This authenticates the source declaration, not the truth of the depicted scene or every word.',he:'הספרייה אימתה את ההצהרה החתומה ואת האמון בחותם. זה מאמת את הצהרת המקור, לא את אמיתות התוכן או המקור של כל מילה.'};
  }
  return r;
}
async function analyzeAIFile(file){
  const doc=readDocx(file);if(doc)return diagnostics(resultFor(doc.text,doc),doc.text);
  const ext=path.extname(file.originalname||'').toLowerCase();
  if(TEXT.has(ext))return analyzeAIText(new TextDecoder('utf-8',{fatal:true}).decode(file.buffer));
  if(ext==='.pdf'){
    const pdf=await require('pdf-parse')(file.buffer);const r=diagnostics(resultFor(pdf.text||''),pdf.text||'');
    r.provenance.c2pa=await readProvenance(file);
    r.assessment.provenance=r.provenance.c2pa;
    r.assessment.checks.unshift({id:'pdf_text',status:pdf.text?.trim()?'completed':'not_available'});
    r.assessment.documentCoverage={pages:pdf.numpages,scope:'PDF extracted text. Scanned-page OCR is reported separately in media findings.'};
    return sourceClaim(r);
  }
  // No decoding of image, video or audio bytes as natural language.
  const r=resultFor('');r.assessment.ai.status='not_assessed';
  r.provenance.c2pa=await readProvenance(file);
  r.assessment.provenance=r.provenance.c2pa;
  r.assessment.title={en:'Media review. AI origin not determined.',he:'בדיקת מדיה. מקור התוכן לא נקבע.'};
  r.assessment.explanation={en:'See the file and media observations below. No calibrated AI classifier is active for this file type. Container or pixel statistics do not establish AI origin.',he:'ממצאי הקובץ והמדיה מופיעים בהמשך. אין מסווג בינה מלאכותית מכויל פעיל לסוג הקובץ הזה. נתוני מבנה ופיקסלים אינם קובעים את מקור התוכן.'};
  r.assessment.checks=r.assessment.checks.map(c=>c.id==='text'||c.id==='local_phrases'?{...c,status:'not_applicable'}:c);
  return sourceClaim(r);
}
module.exports={analyzeAIFile,analyzeAIText,VERSION};
