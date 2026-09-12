'use strict';
const crypto = require('node:crypto');
const VERSION = 'EMET-EVIDENCE-2026.09.12.1';
const codePointLength = text => Array.from(text).length;
const WORD = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’״׳\-][\p{L}\p{M}\p{N}]+)*/gu;
const DICTIONARY = {
  he: ['בנוסף', 'כמו כן', 'לפיכך', 'לכן', 'עם זאת', 'בהתאם', 'לסיכום', 'חשוב לציין', 'מכאן', 'יתרה מכך'],
  ar: ['بالإضافة إلى ذلك', 'علاوة على ذلك', 'ومع ذلك', 'في الختام'],
  en: ['moreover', 'furthermore', 'additionally', 'therefore', 'consequently', 'in conclusion', 'overall', 'it is important to note', 'on the other hand']
};
function scriptLanguage(text) {
  const tests = {he:/\p{Script=Hebrew}/gu,ar:/\p{Script=Arabic}/gu,ja:/[\p{Script=Hiragana}\p{Script=Katakana}]/gu,zh:/\p{Script=Han}/gu,cyrl:/\p{Script=Cyrillic}/gu,latn:/\p{Script=Latin}/gu};
  const counts=Object.fromEntries(Object.entries(tests).map(([key,re])=>[key,(text.match(re)||[]).length]));
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const code=counts.ja? 'ja' : sorted[0][1]?sorted[0][0]:'und';
  return {code,basis:'script_heuristic',scripts:counts};
}
function wordSpans(text) {
  // Preserve the source. Normalisation never changes locator coordinates.
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u.test(text)) {
    const s=new Intl.Segmenter(undefined,{granularity:'word'});
    return Array.from(s.segment(text)).filter(x=>x.isWordLike).map(x=>({text:x.segment,start:x.index,end:x.index+x.segment.length}));
  }
  return Array.from(text.matchAll(WORD),m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
}
function literalRegex(text) {return text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function phraseHits(text, phrases) {
  return phrases.flatMap(phrase=>Array.from(text.matchAll(new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${literalRegex(phrase)}(?![\\p{L}\\p{M}\\p{N}])`,'giu')),m=>({quote:m[0],start:m.index,end:m.index+m[0].length})));
}
function paragraphsOf(text) {
  return Array.from(text.matchAll(/[^\r\n]+/g), (m,i)=>({index:i,text:m[0],startUTF16:m.index,endUTF16:m.index+m[0].length}));
}
function locator(text, start, end, paragraphs) {
  const p=paragraphs.find(p=>start>=p.startUTF16&&start<p.endUTF16);
  return {representation:'emet_plaintext_v1',unit:'unicode_code_points',startCodePoint:codePointLength(text.slice(0,start)),endCodePoint:codePointLength(text.slice(0,end)),startUTF16:start,endUTF16:end,paragraphIndex:p?.index??null,part:p?.part??null,paraId:p?.paraId??null};
}
function inspectText(text, suppliedParagraphs) {
  if(typeof text!=='string') throw new TypeError('Expected decoded text.');
  if(text.length>1000000) throw Object.assign(new Error('Text exceeds the one million character inspection limit.'),{statusCode:413});
  const paragraphs=suppliedParagraphs||paragraphsOf(text),words=wordSpans(text),lang=scriptLanguage(text);
  const findings=[];
  const definitions=[
    {type:'ai_use_disclosure', re:/(?:השתמשתי|השתמשנו|נעזרתי|נעזרנו)\s+(?:בכלי\s+)?(?:ב?בינה מלאכותית|ב[־-]?AI|ב[־-]?(?:ChatGPT|Claude|Gemini))/giu},
    {type:'ai_use_disclosure', re:/(?:העבודה|המסמך|הטקסט)\s+(?:הזאת\s+|הזה\s+)?(?:נכתב[ה]?|נוצר[ה]?)\s+(?:(?:כולו|כולה|באמצעות|בעזרת|על ידי)\s+){0,3}(?:בינה מלאכותית|AI|ChatGPT|Claude|Gemini)/giu},
    {type:'ai_use_disclosure', re:/\b(?:I|we)\s+(?:used|have used)\s+(?:an?\s+)?(?:AI|ChatGPT|Claude|Gemini)\b/giu},
    {type:'ai_use_disclosure', re:/(?:استخدمت|استخدمنا)\s+(?:الذكاء الاصطناعي|ChatGPT)/gu},
    {type:'assistant_phrase',re:/as an ai language model|כמודל שפה של בינה מלאכותית|بوصفي نموذج[اً]* لغوي[اً]*/giu}
  ];
  let total=0;
  for(const p of paragraphs) {
    const t=p.text;
    // A heading, denial, discussion, or quotation is not an admission of authorship.
    const quoted=/["“”«»]/u.test(t),denial=/(?:^|\s)(?:לא|ללא|איני|لم|لن)(?:\s|$)|\b(?:not|never|didn't|without)\b/iu.test(t);
    const academic=/מחקר|למשל|לדוגמ[הא]|ציטוט|כדוגמה|אמר|שאלון|\b(?:example|quote|questionnaire|said|study)\b/iu.test(t);
    for(const definition of definitions) {
      for(const m of t.matchAll(new RegExp(definition.re.source,definition.re.flags))) {
        if(definition.type==='ai_use_disclosure'&&(quoted||denial||academic)) continue;
        const start=p.startUTF16+m.index,end=start+m[0].length;
        total++;
        if(findings.length<60) findings.push({id:`text-${total}`,type:definition.type,status:'observed',quote:text.slice(start,end),locator:locator(text,start,end,paragraphs),context:t.length<=400?t:t.slice(Math.max(0,m.index-100),m.index+m[0].length+150),meaning:definition.type==='ai_use_disclosure'?'A statement in the document reports AI use. It is not independently authenticated.':'This phrase also occurs in quotations and ordinary discussion. It does not establish authorship.'});
      }
    }
  }
  // Contextual disclosure section: return the actual statement, not a keyword match.
  for(let i=0;i<paragraphs.length;i++) {
    if(!/הצהרה על שימוש בכלי בינה מלאכותית/u.test(paragraphs[i].text)) continue;
    for(const p of paragraphs.slice(i+1,i+4)) {
      if(!/השימוש נעשה|השתמשתי|נעזרתי/u.test(p.text)||/לא נעשה|ללא שימוש/u.test(p.text)) continue;
      if(findings.some(f=>f.type==='ai_use_disclosure'&&f.locator.paragraphIndex===p.index)) continue;
      total++;
      if(findings.length<60) findings.push({id:`text-${total}`,type:'ai_use_disclosure',status:'observed',quote:p.text,locator:locator(text,p.startUTF16,p.endUTF16,paragraphs),context:p.text,meaning:'AI use is declared in a disclosure section. Scope and truth of the declaration are not verified.'});
    }
  }
  const dm=phraseHits(text,DICTIONARY[lang.code]||DICTIONARY.en);
  const segments=[];
  for(let i=0;i<words.length;i+=200) {
    const batch=words.slice(i,i+200),start=batch[0].start,end=batch.at(-1).end;
    segments.push({index:segments.length,words:batch.length,...locator(text,start,end,paragraphs)});
  }
  const hash=crypto.createHash('sha256').update(text,'utf8').digest('hex');
  return {version:VERSION,sourceHash:hash,language:lang,words:words.length,paragraphs:paragraphs.length,discourse:{count:dm.length,status:'observed',meaning:'Transition phrases are counted, not treated as proof of AI.'},findings,findingsTotal:total,findingsDisplayed:findings.length,segments,coverage:{unit:'unicode_code_points',textCodePoints:codePointLength(text),inspectedCodePoints:codePointLength(text),fraction:text.length?1:null,truncated:false,scope:'extracted text only'},classifier:{status:'not_configured',modelVersion:null,calibrationId:null,probabilityAI:null,validatedLanguages:[]}};
}
function assess(inspection) {
  const disclosed=inspection.findings.some(f=>f.type==='ai_use_disclosure');
  const phrase=inspection.findings.some(f=>f.type==='assistant_phrase');
  return {version:VERSION,status:'partial',ai:{status:disclosed?'self_reported':phrase?'content_signal':'not_assessed',probability:null,proven:false},model:inspection.classifier,
    title:disclosed?{en:'The document declares AI use',he:'המסמך מצהיר על שימוש בבינה מלאכותית'}:phrase?{en:'An assistant phrase was found',he:'נמצא ביטוי המתייחס לעוזר בינה מלאכותית'}:{en:'File reviewed. AI authorship not determined.',he:'הבדיקה הסתיימה. מקור הכתיבה לא נקבע.'},
    explanation:disclosed?{en:'The exact declaration appears below. This is a statement in the file, not proof that every word was generated.',he:'ההצהרה המדויקת מופיעה בהמשך. זו הצהרה במסמך, לא הוכחה שכל מילה נוצרה בבינה מלאכותית.'}:phrase?{en:'Review the quoted passage below. The phrase may be quoted, discussed, or written by a person.',he:'הקטע המדויק מופיע בהמשך. הביטוי יכול להיות ציטוט, חלק מדיון או ניסוח של אדם.'}:{en:'The local checks found the observations below. No trained, calibrated text classifier is active, so this report cannot give an AI probability or certify human authorship.',he:'הבדיקות המקומיות הפיקו את הממצאים שבהמשך. אין כרגע מסווג טקסט מאומן ומכויל פעיל, ולכן הדוח אינו נותן הסתברות לשימוש בבינה מלאכותית ואינו מאשר כתיבה אנושית.'},
    observations:inspection.findings,coverage:inspection.coverage,language:inspection.language,wordCount:inspection.words,paragraphCount:inspection.paragraphs,sourceHash:inspection.sourceHash,
    checks:[{id:'text',status:'completed'},{id:'local_phrases',status:'completed'},{id:'ai_classifier',status:'not_configured'},{id:'fact_verification',status:'not_checked'}]};
}
module.exports={VERSION,inspectText,assess,wordSpans,phraseHits,scriptLanguage,codePointLength};
