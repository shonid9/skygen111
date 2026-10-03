'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const AdmZip=require('adm-zip');
const {academicContext}=require('../academic-context');
const {analyzeHebrew,profileSnapshot,cohortStatus}=require('../hebrew-analysis');
const {analyzeAIFile,analyzeAIText}=require('../review-engine');
function model(){return {version:'hebrew-cohort-logistic-v1',features:Array.from({length:111},(_,i)=>`f${i}`),window:350,function_words:Array.from({length:94},()=> 'ולכן'),phrases:[],prefixes:[],mean:Array(111).fill(0),scale:Array(111).fill(1),coefficients:Array(111).fill(0),intercept:0,threshold:.72,train_source_ids:[],report:{training_performed:true,is_generic_ai_accuracy:false,holdout:{confusion:{tn:11,fp:0,fn:2,tp:90}}}};}
test('academic structure and references are separated; substantive mention survives',()=>{
 const text='תוכן עניינים\nמבוא .... 1\nממצאים .... 10\nמבוא\nהמחקר בוחן כיצד תוכן עניינים משפר את הבנת הקורא בעת חיפוש מידע.\nמקורות\nCohen (2020). A source.\nנספח א\nזהו גוף הנספח עם מידע משמעותי למחקר.';
 const c=academicContext(text);assert.equal(c.body.length,text.length);assert.equal(c.summary.reasons['table-of-contents'],2);assert.equal(c.summary.reasons.bibliography,1);assert.match(c.body,/כיצד תוכן עניינים משפר/u);assert.match(c.body,/גוף הנספח/u);
});
test('original UTF16 coordinates survive emoji and niqqud masking',()=>{
 const s='🧪 טקסט\nתוכן עניינים\nמבוא ..... 1\nמבוא\nשָׁלוֹם מידע משמעותי לגוף המחקר.';const c=academicContext(s);
 for(const e of c.exclusions)assert.equal(s.slice(e.start,e.end).trim(),e.text);
 assert.equal(c.body.indexOf('שָׁלוֹם'),s.indexOf('שָׁלוֹם'));
});
test('repeated long phrases have verifiable original excerpts and exclude bibliography',()=>{
 const phrase='המשתתפים תיארו חוויות שונות במהלך תקופת החזרה לשגרה';
 const s=`מבוא\n${phrase}.\n${phrase}.\nמקורות\n${phrase}.\n${phrase}.`;
 const h=analyzeHebrew(s);assert.ok(h.profile.repeatedLongPhrases.length);
 for(const r of h.profile.repeatedLongPhrases){assert.equal(r.count,2);for(const l of r.locators)assert.equal(s.slice(l.startUTF16,l.endUTF16),r.quote);}
});
test('common connectors alone are measurements, never authorship probability',()=>{
 const h=analyzeHebrew('בנוסף ולכן כמו כן לפיכך עם זאת. '.repeat(80));assert.equal(h.probabilityAI,null);assert.equal(h.canProve,false);assert.equal(h.profile.repeatedLongPhrases.length,0);
});
test('experimental model is explicit; no final verdict or probability changes',async()=>{
 const old=process.env.EMET_HEBREW_COHORT_MODEL;
 try{process.env.EMET_HEBREW_COHORT_MODEL=JSON.stringify(model());const r=await analyzeAIText('המשתתפים תיארו חוויות רבות שונות במהלך המחקר הנוכחי. '.repeat(80));
  const h=r.assessment.hebrewAnalysis;assert.equal(h.cohort.status,'scored');assert.equal(h.cohort.cohort_score,.5);assert.equal(h.cohort.ai_probability,null);assert.equal(h.cohort.seen_in_training,null);assert.equal(r.final.verdict,'CLASSIFIER_NOT_CONFIGURED');assert.equal(r.assessment.ai.probability,null);assert.equal(cohortStatus().genericAIDetectionValidated,false);
 }finally{if(old===undefined)delete process.env.EMET_HEBREW_COHORT_MODEL;else process.env.EMET_HEBREW_COHORT_MODEL=old;}
});
test('short Hebrew remains insufficient; other scripts are not silently scored',()=>{
 const old=process.env.EMET_HEBREW_COHORT_MODEL;
 try{process.env.EMET_HEBREW_COHORT_MODEL=JSON.stringify(model());assert.equal(analyzeHebrew('שלום וברכה').cohort.status,'insufficient_text');assert.equal(analyzeHebrew('An English document').status,'not_applicable');}
 finally{if(old===undefined)delete process.env.EMET_HEBREW_COHORT_MODEL;else process.env.EMET_HEBREW_COHORT_MODEL=old;}
});
test('corrupted artifacts and private IDs fail closed',()=>{
 const old=process.env.EMET_HEBREW_COHORT_MODEL;
 try{for(const raw of ['invalid',JSON.stringify({...model(),scale:Array(111).fill(0)}),JSON.stringify({...model(),train_source_ids:['a'.repeat(36)]})]){process.env.EMET_HEBREW_COHORT_MODEL=raw;assert.equal(cohortStatus().status,'invalid_artifact');assert.equal(analyzeHebrew('טקסט עברי').cohort.ai_probability,null);}}
 finally{if(old===undefined)delete process.env.EMET_HEBREW_COHORT_MODEL;else process.env.EMET_HEBREW_COHORT_MODEL=old;}
});
test('DOCX map excludes TOC/reference paragraphs and no longer estimates AI share',async()=>{
 const zip=new AdmZip(),paragraphs=['תוכן עניינים','סקירת ספרות .... 3','מבוא','המחקר הנוכחי עוסק בחוויות של המשתתפים במהלך חזרתם לשגרה.','מקורות','משפט מקור ארוך מתוך מאמר משותף שצריך להיות מופרד.'];
 zip.addFile('word/document.xml',Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map(t=>`<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`));
 const r=await analyzeAIFile({originalname:'sample.docx',buffer:zip.toBuffer()});const m=r.assessment.authorshipMap;
 assert.equal(m.items.length,1);assert.equal(m.items[0].paragraphIndex,3);assert.equal(m.estimatedAIShare,null);assert.equal(m.attributionStatus,'uncalibrated_diagnostics');
});
test('snapshot carries rules and artifact provenance without source text or auto training',()=>{
 const h=analyzeHebrew('מבוא\nהמשתתפים תיארו חוויות רבות בזמן החזרה לשגרה.');const p=profileSnapshot({hebrewAnalysis:h});assert.equal(p.sourceHash,h.sourceHash);assert.equal(p.automaticallyAddedToTraining,false);assert.ok(!JSON.stringify(p).includes('המשתתפים'));assert.ok(!JSON.stringify(p).includes('quote'));
});
test('scan memory uses user-scoped JWT and explicitly reports backend failure',async()=>{
 const {saveScanMemory,memoryMetadata}=require('../scan-memory');
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
 try{process.env.SUPABASE_URL='https://example.test';process.env.SUPABASE_PUBLISHABLE_KEY='publishable';
  const row={user_id:'owner',metadata:memoryMetadata({aiAnalysis:{assessment:{hebrewAnalysis:analyzeHebrew('טקסט פרטי אישי שלא יישמר בפרופיל')}}})};
  const result=await saveScanMemory(row,'user-jwt',async(url,args)=>{assert.equal(url,'https://example.test/rest/v1/scans');assert.equal(args.headers.authorization,'Bearer user-jwt');assert.equal(args.headers.apikey,'publishable');assert.equal(JSON.parse(args.body).user_id,'owner');assert.ok(!args.body.includes('טקסט פרטי'));return {ok:true};});
  assert.equal(result.status,'saved');assert.equal((await saveScanMemory(row,'user-jwt',async()=>({ok:false}))).status,'failed');assert.equal((await saveScanMemory(row,null)).status,'not_configured');
 }finally{for(const [k,v] of [['SUPABASE_URL',oldUrl],['SUPABASE_PUBLISHABLE_KEY',oldKey]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('Hebrew punctuation is not counted as niqqud',()=>{
 const h=analyzeHebrew('שלום׀ עולם׃ שלום׆ עולם.');assert.equal(h.profile.niqqudPer1000Letters,0);
});
test('marked Hebrew cannot inflate a short sample into 500 pilot words',()=>{
 const old=process.env.EMET_HEBREW_COHORT_MODEL;
 try{process.env.EMET_HEBREW_COHORT_MODEL=JSON.stringify(model());assert.equal(analyzeHebrew('שָׁלוֹם '.repeat(180)).cohort.status,'insufficient_text');assert.equal(analyzeHebrew('שָׁלוֹם '.repeat(600)).cohort.status,'unsupported_niqqud_tokenization');}
 finally{if(old===undefined)delete process.env.EMET_HEBREW_COHORT_MODEL;else process.env.EMET_HEBREW_COHORT_MODEL=old;}
});
