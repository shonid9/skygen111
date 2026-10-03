'use strict';
// Versioned, inspectable context policy. Offsets always refer to the original UTF-16 text.
const CONTEXT_VERSION='academic-context-v1';
const CONTEXT_RULES={version:CONTEXT_VERSION,rules:[
 {id:'academic-heading',reason:'כותרת אקדמית מקובלת; אינה ראיה לניסוח ייחודי'},
 {id:'table-of-contents',reason:'רשומת תוכן עניינים; מתארת את מבנה העבודה'},
 {id:'bibliography',reason:'רשומת מקור; ניסוחה עשוי להגיע ממקור משותף'},
 {id:'declaration',reason:'הצהרה או טופס מקובלים; מוצגים בנפרד מגוף המחקר'}
],format_weight:0,frequency_alone_is_ai_evidence:false};
const norm=s=>s.normalize('NFKC').replace(/[\u0591-\u05bd\u05bf\u05c1-\u05c2\u05c4-\u05c5\u05c7]/g,'').replace(/["״׳']/g,'').trim();
const heading=s=>norm(s).replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/[:.\s]+$/,'');
const toc=s=>/^(?:תוכן\s*(?:ה)?עניינים|תוכן הענינים|תוכן ענינים)$/u.test(heading(s));
const refs=s=>/^(?:ביבליוגרפיה|רשימת (?:ה)?מקורות|מקורות|מקורות מידע|References|Bibliography)$/iu.test(heading(s));
const academic=s=>/^(?:מבוא|תקציר|סיכום|מסקנות|סיכום ומסקנות|דיון|דיון ומסקנות|סקירת ספרות|שיט(?:ת|ות) המחקר|מתודולוגיה|ממצאים|תוצאות|נספחים|נספח\s*[א-ת\d]?)$/u.test(heading(s))||toc(s)||refs(s);
const tocEntry=s=>s.length<260&&(/[.…\t]{2,}\s*\d+\s*$/.test(s)||/[א-תA-Za-z)\]]\s*\d{1,3}\s*$/.test(s));
const section=s=>s.length<150&&!/[.!?]$/.test(s)&&s.split(/\s+/).length<=16&&/^(?:\d+(?:\.\d+)*[.)]?\s+|פרק\s|נספח\s)/u.test(s);
function academicContext(text){
 const lines=[...text.matchAll(/[^\n]+(?:\n|$)/g)].map(m=>({text:m[0].trim(),start:m.index,end:m.index+m[0].length}));
 const exclusions=[];let mode='body';
 for(let i=0;i<lines.length;i++){
  const l=lines[i],s=l.text;if(!s)continue;let rule=null;
  if(toc(s)){mode='toc';rule='academic-heading';}
  else if(refs(s)){mode='references';rule='academic-heading';}
  else if(academic(s)){mode='body';rule='academic-heading';}
  else if(mode==='toc'){
   if(tocEntry(s))rule='table-of-contents';
   else {mode='body';if(section(s))rule='academic-heading';}
  }else if(mode==='references'){
   if(section(s)){mode='body';rule='academic-heading';}else rule='bibliography';
  }else if(section(s))rule='academic-heading';
  else if(s.length<650&&/^(?:הצהר(?:ה|ת)\s|אני (?:מצהיר|מצהירה|מאשר|מאשרת)(?:\s|$)|הנני מצהיר)/u.test(s))rule='declaration';
  if(rule)exclusions.push({...l,rule,reason:CONTEXT_RULES.rules.find(r=>r.id===rule).reason});
 }
 const chars=text.split('');for(const e of exclusions)for(let i=e.start;i<e.end;i++)if(chars[i]!=='\n')chars[i]=' ';
 return {version:CONTEXT_VERSION,body:chars.join(''),exclusions,summary:{version:CONTEXT_VERSION,excluded_lines:exclusions.length,excluded_characters:exclusions.reduce((n,e)=>n+e.end-e.start,0),reasons:exclusions.reduce((m,e)=>(m[e.rule]=(m[e.rule]||0)+1,m),{}),rules:CONTEXT_RULES.rules}};
}
function bodySegments(text){const c=academicContext(text);return c.body.split(/\n+/).filter(s=>s.trim());}

module.exports={CONTEXT_VERSION,CONTEXT_RULES,academicContext,bodySegments};
