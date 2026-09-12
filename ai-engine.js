const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const ExifReader = require('exifreader');

const ENGINE_VERSION = 'EMET-AI-2026.09.12';

const AI_TOOL_NAMES = [
  'openai','chatgpt','gpt-4','gpt-5','gemini','google ai','claude','anthropic','copilot',
  'midjourney','stable diffusion','firefly','dall-e','sora','imagen','veo','runway','canva magic'
];

const PROMPT_RESIDUE = [
  /as an ai language model/gi,
  /i (?:cannot|can't) (?:browse|access) the internet/gi,
  /(?:^|\n)assistant\s*:/gi,
  /(?:^|\n)system\s*:/gi,
  /(?:^|\n)user\s*:/gi,
  /here(?:'s| is) (?:a|the) (?:revised|polished|improved) version/gi,
  /certainly[!,.]? (?:here|below)/gi,
  /i hope this helps/gi,
  /let me know if you(?:'d| would) like/gi,
  /would you like me to/gi,
  /i can also (?:help|provide|create|draft)/gi
];

const DISCOURSE_PATTERNS = {
  en: [
    /\bmoreover\b/gi,/\bfurthermore\b/gi,/\badditionally\b/gi,/\bconsequently\b/gi,
    /\bin conclusion\b/gi,/\bin summary\b/gi,/\boverall\b/gi,/\bit is important to note\b/gi,
    /\bit is worth noting\b/gi,/\bon the other hand\b/gi,/\bthis highlights\b/gi,/\bthis underscores\b/gi,
    /\bin today's (?:rapidly )?(?:evolving|changing)\b/gi,/\bmultifaceted\b/gi,/\bnuanced\b/gi,
    /\bseamless(?:ly)?\b/gi,/\brobust\b/gi,/\bleverag(?:e|ing)\b/gi,/\btransformative\b/gi,
    /\bfoster(?:ing|s)?\b/gi,/\blandscape\b/gi,/\bdelve\b/gi,/\bkey considerations\b/gi,
    /\bnot only\b[^.!?]{0,100}\bbut also\b/gi
  ],
  he: [
    /חשוב לציין/gi,/ראוי לציין/gi,/בנוסף לכך/gi,/יתר על כן/gi,/מנגד/gi,/לסיכום/gi,
    /באופן כללי/gi,/בהתאם לכך/gi,/במילים אחרות/gi,/יש להדגיש/gi,/תמונה מורכבת/gi,
    /מגוון רחב/gi,/מנקודת מבט/gi,/בהקשר זה/gi
  ],
  ar: [
    /بالإضافة إلى ذلك/gi,/علاوة على ذلك/gi,/في الختام/gi,/من المهم الإشارة/gi,
    /من ناحية أخرى/gi,/بشكل عام/gi,/في هذا السياق/gi,/تجدر الإشارة/gi,/بعبارة أخرى/gi
  ]
};

function clamp(n,min=0,max=100){ return Math.max(min,Math.min(max,Number.isFinite(n)?n:0)); }
function round(n,d=3){ const p=10**d; return Math.round((Number(n)||0)*p)/p; }
function uniq(a){ return [...new Set((a||[]).filter(Boolean))]; }
function safeJson(v,fallback={}){ try{return typeof v==='string'?JSON.parse(v):v;}catch{return fallback;} }
function timeout(ms=15000){ return AbortSignal.timeout(ms); }
function recursiveStrings(v,out=[],depth=0){
  if(depth>8||out.length>1500)return out;
  if(typeof v==='string')out.push(v);
  else if(Array.isArray(v))for(const x of v)recursiveStrings(x,out,depth+1);
  else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){out.push(k);recursiveStrings(x,out,depth+1);}
  return out;
}
function findToolNames(text){
  const low=String(text||'').toLowerCase();
  return AI_TOOL_NAMES.filter(x=>low.includes(x));
}
function tokenize(text){ return String(text||'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]; }
function splitSentences(text){
  return String(text||'').replace(/\r/g,'').split(/(?<=[.!?\u05C3\u061F])\s+(?=[\p{L}\p{N}"'“‘])/u).map(s=>s.trim()).filter(Boolean);
}
function coeffVar(nums){
  if(!nums.length)return 0; const m=nums.reduce((a,b)=>a+b,0)/nums.length;if(!m)return 0;
  return Math.sqrt(nums.reduce((a,b)=>a+(b-m)**2,0)/nums.length)/m;
}
function mean(nums){return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0;}
function stdev(nums){const m=mean(nums);return nums.length?Math.sqrt(nums.reduce((a,b)=>a+(b-m)**2,0)/nums.length):0;}
function shannon(items){
  if(!items.length)return 0;const m=new Map();for(const x of items)m.set(x,(m.get(x)||0)+1);
  let h=0;for(const n of m.values()){const p=n/items.length;h-=p*Math.log2(p);}return h;
}
function repeatedNgramRatio(words,n=4){
  if(words.length<n*2)return 0;const m=new Map();let total=0,repeated=0;
  for(let i=0;i<=words.length-n;i++){const g=words.slice(i,i+n).join(' ');m.set(g,(m.get(g)||0)+1);total++;}
  for(const c of m.values())if(c>1)repeated+=c-1;return total?repeated/total:0;
}
function avgAdjacentJaccard(sentences){
  const sets=sentences.map(s=>new Set(tokenize(s.toLowerCase()).filter(w=>w.length>3)));
  if(sets.length<2)return 0;const vals=[];
  for(let i=1;i<sets.length;i++){
    const a=sets[i-1],b=sets[i];if(!a.size||!b.size)continue;
    let inter=0;for(const x of a)if(b.has(x))inter++;const union=a.size+b.size-inter;if(union)vals.push(inter/union);
  }
  return mean(vals);
}
function detectLanguage(text){
  const sample=String(text||'').slice(0,30000);
  const en=(sample.match(/[A-Za-z]/g)||[]).length;
  const he=(sample.match(/[\u0590-\u05FF]/g)||[]).length;
  const ar=(sample.match(/[\u0600-\u06FF]/g)||[]).length;
  const total=en+he+ar||1;
  if(he/total>0.45)return'he';if(ar/total>0.45)return'ar';return'en';
}
function scriptFlags(text){
  const tokens=String(text||'').split(/\s+/).filter(Boolean);let mixed=0;const examples=[];
  for(const t of tokens){const lat=/[A-Za-z]/.test(t),cyr=/[\u0400-\u04FF]/.test(t),greek=/[\u0370-\u03FF]/.test(t);if(lat&&(cyr||greek)){mixed++;if(examples.length<12)examples.push(t.slice(0,80));}}
  return{mixedScriptTokens:mixed,examples};
}
function compressionFeatures(text){
  const b=Buffer.from(String(text||''),'utf8');if(b.length<80)return{gzipRatio:null,deflateRatio:null};
  try{return{gzipRatio:round(zlib.gzipSync(b,{level:9}).length/b.length,4),deflateRatio:round(zlib.deflateRawSync(b,{level:9}).length/b.length,4)};}catch{return{gzipRatio:null,deflateRatio:null};}
}
function manipulationSignals(text){
  text=String(text||'');
  const zeroWidth=(text.match(/[\u200B\u200C\u200D\u2060\uFEFF]/g)||[]).length;
  const bidi=(text.match(/[\u202A-\u202E\u2066-\u2069]/g)||[]).length;
  const nbsp=(text.match(/\u00A0/g)||[]).length;
  const softHyphen=(text.match(/\u00AD/g)||[]).length;
  const scripts=scriptFlags(text);const prompt=[];
  for(const re of PROMPT_RESIDUE){re.lastIndex=0;const n=(text.match(re)||[]).length;if(n)prompt.push({pattern:re.source,count:n});}
  const evasionCount=zeroWidth+bidi+softHyphen+scripts.mixedScriptTokens;
  const severity=evasionCount>10?'high':evasionCount?'review':'none';
  return{zeroWidth,bidiControls:bidi,nonBreakingSpaces:nbsp,softHyphens:softHyphen,mixedScriptTokens:scripts.mixedScriptTokens,mixedScriptExamples:scripts.examples,promptResidue:prompt,evasionCount,severity};
}
function discourseHits(text,lang){
  const list=DISCOURSE_PATTERNS[lang]||DISCOURSE_PATTERNS.en;let n=0;const matches=[];
  for(const re of list){re.lastIndex=0;const found=text.match(re)||[];if(found.length){n+=found.length;if(matches.length<16)matches.push({pattern:re.source,count:found.length});}}
  return{count:n,matches};
}
function styleFeatures(text){
  text=String(text||'').trim();const words=tokenize(text);const sentences=splitSentences(text);const paras=text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  const lang=detectLanguage(text);const lower=words.map(w=>w.toLowerCase());const lens=sentences.map(s=>tokenize(s).length).filter(Boolean);
  const unique=new Set(lower);const counts=new Map();lower.forEach(w=>counts.set(w,(counts.get(w)||0)+1));const hapax=[...counts.values()].filter(n=>n===1).length;
  const punctuation=(text.match(/[.,;:!?()—–\-"“”'’،؛؟]/g)||[]);const starters=sentences.map(s=>tokenize(s).slice(0,3).join(' ').toLowerCase()).filter(Boolean);
  const starterRep=starters.length?1-new Set(starters).size/starters.length:0;const contractions=(text.match(/\b(?:\w+['’](?:t|s|re|ve|ll|d|m))\b/gi)||[]).length;
  const sentCv=coeffVar(lens),paraCv=coeffVar(paras.map(p=>tokenize(p).length));const ttr=words.length?unique.size/words.length:0;const hapaxRatio=unique.size?hapax/unique.size:0;
  const punctDiversity=punctuation.length?new Set(punctuation).size/Math.min(14,punctuation.length):0;const entropy=shannon(lower);const rep3=repeatedNgramRatio(lower,3);const rep4=repeatedNgramRatio(lower,4);
  const adjacency=avgAdjacentJaccard(sentences);const discourse=discourseHits(text,lang);const comp=compressionFeatures(text);
  const questionRate=sentences.length?(text.match(/[?\u061F]/g)||[]).length/sentences.length:0;
  const exclaimRate=sentences.length?(text.match(/!/g)||[]).length/sentences.length:0;
  const colonRate=sentences.length?(text.match(/:/g)||[]).length/sentences.length:0;
  const quoteRate=words.length?(text.match(/["“”]/g)||[]).length/words.length:0;
  const lenMean=mean(lens),lenSd=stdev(lens);

  const panels=[];
  let rhythm=0;const rhythmReasons=[];
  if(words.length>=120&&sentCv<0.31){rhythm+=48;rhythmReasons.push('very even sentence-length rhythm');}
  else if(words.length>=120&&sentCv<0.40){rhythm+=30;rhythmReasons.push('even sentence-length rhythm');}
  if(paras.length>=4&&paraCv>0&&paraCv<0.24){rhythm+=28;rhythmReasons.push('paragraph sizes are unusually balanced');}
  if(starterRep>0.28&&sentences.length>=8){rhythm+=22;rhythmReasons.push('sentence openings repeat');}
  panels.push({id:'rhythm',label:'Rhythm',score:clamp(rhythm),reasons:rhythmReasons});

  let lexical=0;const lexicalReasons=[];
  if(words.length>=180&&ttr<0.39){lexical+=28;lexicalReasons.push('low lexical diversity');}
  if(words.length>=180&&hapaxRatio<0.48){lexical+=18;lexicalReasons.push('few one-off words');}
  if(words.length>=180&&entropy<6.25){lexical+=18;lexicalReasons.push('low lexical entropy');}
  if(rep4>0.018){lexical+=22;lexicalReasons.push('repeated four-word sequences');}
  if(rep3>0.035){lexical+=14;lexicalReasons.push('repeated three-word sequences');}
  panels.push({id:'lexical',label:'Lexical',score:clamp(lexical),reasons:lexicalReasons});

  let discourseScore=0;const discourseReasons=[];const discourseDensity=words.length?discourse.count/words.length:0;
  if(words.length>=120&&discourseDensity>0.012){discourseScore+=42;discourseReasons.push('dense formulaic discourse markers');}
  else if(words.length>=120&&discourseDensity>0.006){discourseScore+=24;discourseReasons.push('elevated formulaic discourse markers');}
  if(adjacency>0.16&&sentences.length>=8){discourseScore+=26;discourseReasons.push('adjacent sentences recycle vocabulary');}
  if(questionRate<0.01&&exclaimRate<0.01&&words.length>250){discourseScore+=10;discourseReasons.push('very flat sentence-mode distribution');}
  if(colonRate>0.22&&sentences.length>=8){discourseScore+=10;discourseReasons.push('highly regular explanatory punctuation');}
  panels.push({id:'discourse',label:'Discourse',score:clamp(discourseScore),reasons:discourseReasons});

  let punctuationScore=0;const punctuationReasons=[];
  if(words.length>=180&&punctDiversity<0.26){punctuationScore+=36;punctuationReasons.push('narrow punctuation variety');}
  if(lang==='en'&&words.length>=180&&contractions/words.length<0.0015){punctuationScore+=22;punctuationReasons.push('contractions are nearly absent');}
  if(quoteRate===0&&words.length>500){punctuationScore+=8;punctuationReasons.push('no quotation marks across a long sample');}
  panels.push({id:'surface',label:'Surface style',score:clamp(punctuationScore),reasons:punctuationReasons});

  let predictability=0;const predictabilityReasons=[];
  if(comp.gzipRatio!==null&&words.length>=180&&comp.gzipRatio<0.48){predictability+=30;predictabilityReasons.push('text compresses unusually well');}
  if(rep4>0.025){predictability+=25;predictabilityReasons.push('phrase reuse increases predictability');}
  if(sentCv<0.34&&adjacency>0.13){predictability+=24;predictabilityReasons.push('rhythm and semantic repetition align');}
  panels.push({id:'predictability',label:'Predictability',score:clamp(predictability),reasons:predictabilityReasons});

  const residueCount=PROMPT_RESIDUE.reduce((n,re)=>{re.lastIndex=0;return n+(text.match(re)||[]).length;},0);
  panels.push({id:'residue',label:'AI residue',score:residueCount?100:0,reasons:residueCount?['assistant or prompt residue found']:[]});

  const active=panels.filter(p=>p.id!=='residue');const weighted=active.reduce((s,p)=>s+p.score,0)/(active.length||1);
  const residueBoost=residueCount?22:0;const regularityScore=clamp(weighted+residueBoost);
  const reasons=panels.flatMap(p=>p.reasons.map(r=>`${p.label}: ${r}`)).slice(0,16);
  return{
    language:lang,words:words.length,sentences:sentences.length,paragraphs:paras.length,
    sentenceMean:round(lenMean,1),sentenceStdDev:round(lenSd,1),sentenceCv:round(sentCv),paragraphCv:round(paraCv),
    typeTokenRatio:round(ttr),hapaxRatio:round(hapaxRatio),lexicalEntropy:round(entropy),punctuationDiversity:round(punctDiversity),
    sentenceStarterRepetition:round(starterRep),repeatedThreegramRatio:round(rep3),repeatedFourgramRatio:round(rep4),
    adjacentSentenceOverlap:round(adjacency),discourseDensity:round(discourseDensity,4),contractionRate:round(words.length?contractions/words.length:0,4),
    gzipRatio:comp.gzipRatio,deflateRatio:comp.deflateRatio,questionRate:round(questionRate,3),exclamationRate:round(exclaimRate,3),
    localPanels:panels,regularityScore:round(regularityScore,1),reasons,
    interpretation:regularityScore>=68?'strong machine-like regularity':regularityScore>=45?'moderate machine-like regularity':'weak machine-like regularity',
    note:'This local ensemble measures regularity and AI-like artifacts. It is not cryptographic proof of authorship.'
  };
}
function windowAnalysis(text){
  const sentences=splitSentences(text);const windows=[];let bucket=[],count=0,start=0,cursor=0;
  for(const s of sentences){
    const w=tokenize(s).length;
    if(count>=150&&count+w>260){const chunk=bucket.join(' ');const f=styleFeatures(chunk);windows.push({index:windows.length,startChar:start,endChar:start+chunk.length,words:f.words,score:f.regularityScore,label:f.interpretation,reasons:f.reasons.slice(0,6)});cursor=start+chunk.length;start=cursor+1;bucket=[];count=0;}
    bucket.push(s);count+=w;
  }
  if(bucket.length){const chunk=bucket.join(' ');const f=styleFeatures(chunk);windows.push({index:windows.length,startChar:start,endChar:start+chunk.length,words:f.words,score:f.regularityScore,label:f.interpretation,reasons:f.reasons.slice(0,6)});}
  const scores=windows.filter(w=>w.words>=80).map(w=>w.score);const spread=scores.length>1?Math.max(...scores)-Math.min(...scores):0;const sd=stdev(scores);
  return{windows:windows.slice(0,48),changePoint:{scoreSpread:round(spread,1),scoreStdDev:round(sd,1),mixedAuthorshipSignal:scores.length>=2&&spread>=35?'review':scores.length>=2&&spread>=22?'possible':'none'}};
}

function xmlText(entry){try{return entry.getData().toString('utf8')}catch{return'';}}
function extractOffice(buffer,ext){
  const zip=new AdmZip(buffer);const entries=zip.getEntries();const names=entries.map(e=>e.entryName);const chunks=[];const readNames=[];
  if(['.docx','.docm'].includes(ext))readNames.push(...names.filter(n=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(n)));
  if(['.pptx','.pptm'].includes(ext))readNames.push(...names.filter(n=>/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/i.test(n)));
  if(['.xlsx','.xlsm'].includes(ext))readNames.push(...names.filter(n=>/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(n)));
  for(const n of readNames){const e=zip.getEntry(n);if(!e)continue;const x=xmlText(e);for(const m of x.matchAll(/<(?:w:t|w:delText|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|w:delText|a:t|t)>/gi))chunks.push(m[1].replace(/<[^>]+>/g,''));}
  const metaNames=names.filter(n=>/^docProps\//i.test(n)||/settings\.xml$/i.test(n)||/\.rels$/i.test(n)||/customXml\//i.test(n));const metaRaw=metaNames.map(n=>xmlText(zip.getEntry(n))).join('\n');const allXml=entries.filter(e=>/\.xml$/i.test(e.entryName)).map(xmlText).join('\n');
  const authors=uniq([...allXml.matchAll(/w:author="([^"]+)"/gi)].map(m=>m[1])).slice(0,40);
  const rsids=uniq([...allXml.matchAll(/w:rsid(?:R|RPr|Del|P|Sect)?="([0-9A-F]+)"/gi)].map(m=>m[1])).slice(0,300);
  const created=(metaRaw.match(/<[^>]*:?created[^>]*>([^<]+)</i)||[])[1]||null;const modified=(metaRaw.match(/<[^>]*:?modified[^>]*>([^<]+)</i)||[])[1]||null;
  const totalTime=(metaRaw.match(/<TotalTime>(\d+)<\/TotalTime>/i)||[])[1]||null;const reportedWords=(metaRaw.match(/<Words>(\d+)<\/Words>/i)||[])[1]||null;
  const tracked=(allXml.match(/<w:(?:ins|del|moveFrom|moveTo)\b/gi)||[]).length;const comments=(allXml.match(/<w:comment\b/gi)||[]).length;const hidden=(allXml.match(/<w:(?:vanish|webHidden)\b/gi)||[]).length;const altChunks=(allXml.match(/<w:altChunk\b/gi)||[]).length;
  const external=(metaRaw.match(/TargetMode="External"/gi)||[]).length;const zipTimes=entries.map(e=>e.header?.time instanceof Date?e.header.time.getTime():null).filter(Boolean);
  let lifetimeHours=null;if(created&&modified){const a=Date.parse(created),b=Date.parse(modified);if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)lifetimeHours=round((b-a)/36e5,2);}
  const text=chunks.join(' ').replace(/\s+/g,' ').trim();const textWords=tokenize(text).length;const editMinutes=totalTime?Number(totalTime):null;
  const processSignals=[];
  if(textWords>=500&&lifetimeHours!==null&&lifetimeHours<0.15&&tracked===0)processSignals.push({type:'review',signal:'large document with very short stored lifetime and no tracked revisions'});
  if(textWords>=1000&&editMinutes!==null&&editMinutes<5)processSignals.push({type:'review',signal:'reported editing time is very low for document length'});
  if(altChunks>0)processSignals.push({type:'info',signal:'imported content blocks are present'});
  if(rsids.length>60)processSignals.push({type:'info',signal:'many revision/session identifiers are present'});
  return{text,forensics:{packageParts:names.length,created,modified,lifetimeHours,zipEarliest:zipTimes.length?new Date(Math.min(...zipTimes)).toISOString():null,zipLatest:zipTimes.length?new Date(Math.max(...zipTimes)).toISOString():null,revisionAuthors:authors,rsidCount:rsids.length,hiddenTextProperties:hidden,altChunkImports:altChunks,trackedRevisionMarkers:tracked,commentRecords:comments,externalRelationships:external,totalEditingMinutes:editMinutes,reportedWords:reportedWords?Number(reportedWords):null,extractedWords:textWords,generatorFingerprints:findToolNames(metaRaw),macroPayload:names.some(n=>/vbaProject\.bin$/i.test(n)),digitalSignatureParts:names.filter(n=>/_xmlsignatures\//i.test(n)).length,customXmlParts:names.filter(n=>/^customXml\//i.test(n)).length,processSignals}};
}
async function extractPdf(buffer){
  const d=await pdfParse(buffer);const latin=buffer.toString('latin1');const eof=(latin.match(/%%EOF/g)||[]).length,sx=(latin.match(/startxref/g)||[]).length;const sig=(latin.match(/\/Type\s*\/Sig\b|\/ByteRange\s*\[/g)||[]).length;const js=(latin.match(/\/JavaScript\b|\/JS\s*[<(]/g)||[]).length;const embedded=(latin.match(/\/EmbeddedFile\b/g)||[]).length;const forms=(latin.match(/\/AcroForm\b/g)||[]).length;const xrefStreams=(latin.match(/\/Type\s*\/XRef\b/g)||[]).length;const meta=JSON.stringify(d.info||{})+' '+String(d.metadata||'');
  return{text:d.text||'',forensics:{pages:d.numpages||0,eofMarkers:eof,startXrefMarkers:sx,incrementalUpdateLikely:eof>1||sx>1,pdfSignatureMarkers:sig,embeddedFiles:embedded,javascriptActions:js,acroFormMarkers:forms,xrefStreams,generatorFingerprints:findToolNames(meta),producer:d.info?.Producer||null,creator:d.info?.Creator||null,creationDate:d.info?.CreationDate||null,modificationDate:d.info?.ModDate||null}};
}
function extractImage(buffer){
  let tags={};try{tags=ExifReader.load(buffer,{expanded:true})}catch{}const vals=[];const walk=(v,d=0)=>{if(d>5||!v)return;if(typeof v==='string'||typeof v==='number')vals.push(String(v));else if(Array.isArray(v))v.slice(0,100).forEach(x=>walk(x,d+1));else if(typeof v==='object')Object.entries(v).slice(0,220).forEach(([k,x])=>{vals.push(k);if(x&&typeof x==='object'&&'description'in x)vals.push(String(x.description));else walk(x,d+1);});};walk(tags);const raw=vals.join(' ');return{text:'',forensics:{metadataFieldEstimate:vals.length,generatorFingerprints:findToolNames(raw)}};
}
async function extractForAI(file){
  const ext=path.extname(file.originalname||'').toLowerCase(),b=file.buffer;
  if(['.docx','.docm','.pptx','.pptm','.xlsx','.xlsm'].includes(ext))return extractOffice(b,ext);
  if(ext==='.pdf')return await extractPdf(b);
  if(['.jpg','.jpeg','.png','.webp','.gif','.tif','.tiff'].includes(ext))return extractImage(b);
  if(ext==='.eml'){const s=b.toString('utf8');return{text:s.split(/\r?\n\r?\n/).slice(1).join('\n\n'),forensics:{generatorFingerprints:findToolNames(s.slice(0,18000))}};}
  if(['.txt','.md','.csv','.json','.xml','.html','.htm','.js','.ts','.tsx','.jsx','.py','.java','.c','.cpp','.cs','.go','.rs','.php','.rb','.sql','.sh','.yaml','.yml'].includes(ext)||String(file.mimetype||'').startsWith('text/'))return{text:b.toString('utf8'),forensics:{}};
  return{text:'',forensics:{}};
}

async function c2paCheck(file){
  const ext=path.extname(file.originalname||'')||'.bin';const tmp=path.join(os.tmpdir(),`emet-${crypto.randomUUID()}${ext}`);
  try{fs.writeFileSync(tmp,file.buffer);const{Reader}=await import('@contentauth/c2pa-node');const reader=await Reader.fromAsset({path:tmp});let store=typeof reader.json==='function'?await reader.json():{};store=safeJson(store,store||{});let active=null;try{active=typeof reader.getActive==='function'?await reader.getActive():null}catch{}let embedded=null;try{embedded=typeof reader.isEmbedded==='function'?await reader.isEmbedded():null}catch{}
    const strings=recursiveStrings(store,[]),joined=strings.join(' ');const aiDeclared=/trainedAlgorithmicMedia|algorithmicMedia|generative.?ai|ai.?generated|digitalSourceType[^\n]{0,80}algorithm/i.test(joined);const bad=strings.filter(x=>/validation|signature|trust|certificate/i.test(x)).some(x=>/invalid|error|failure|untrusted|mismatch/i.test(x));const manifestCount=store?.manifests?Object.keys(store.manifests).length:(joined?1:0);
    return{available:true,manifestPresent:manifestCount>0,embedded,manifestCount,aiDeclared,validationPassed:manifestCount>0&&!bad,claimGenerator:active?.claim_generator||active?.claimGenerator||null,activeTitle:active?.title||null,summary:strings.filter(x=>/c2pa|source|action|generator|algorithm|validation/i.test(x)).slice(0,50)};
  }catch(e){return{available:true,manifestPresent:false,error:e.message?.slice(0,260)||'C2PA read failed'};}finally{try{fs.unlinkSync(tmp)}catch{}}
}

async function gptZero(text){
  const key=process.env.GPTZERO_API_KEY;if(!key||tokenize(text).length<80)return null;
  try{const r=await fetch('https://api.gptzero.me/v2/predict/text',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({document:text.slice(0,120000)}),signal:timeout(20000)});const j=await r.json();if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);const d=j.documents?.[0]||j.document||j;const cls=String(d.document_classification||d.classification||d.prediction||'').toUpperCase();const probs=d.class_probabilities||d.probabilities||{};const verdict=cls.includes('AI_ONLY')||cls==='AI'?'AI':cls.includes('MIXED')?'MIXED':cls.includes('HUMAN')?'HUMAN':'UNKNOWN';return{provider:'GPTZero',verdict,classification:cls||null,confidence:d.confidence_category||d.confidence||null,probabilities:probs,segments:(d.sentences||d.sentence_results||[]).slice(0,80)};}catch(e){return{provider:'GPTZero',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
async function pangram(text){
  const key=process.env.PANGRAM_API_KEY;if(!key||tokenize(text).length<80)return null;
  try{const r=await fetch('https://text.api.pangram.com/v3',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({text:text.slice(0,120000)}),signal:timeout(20000)});const j=await r.json();if(!r.ok)throw new Error(j?.detail||j?.message||`HTTP ${r.status}`);const p=String(j.prediction_short||j.prediction||'').toUpperCase();const verdict=p.includes('AI-ASSISTED')||p.includes('MIXED')?'MIXED':p==='AI'||p.includes('AI GENERATED')?'AI':p.includes('HUMAN')?'HUMAN':'UNKNOWN';return{provider:'Pangram',verdict,classification:j.prediction_short||j.prediction||null,fractionAI:j.fraction_ai??null,fractionAIAssisted:j.fraction_ai_assisted??null,fractionHuman:j.fraction_human??null,segments:(j.windows||j.segments||[]).slice(0,80)};}catch(e){return{provider:'Pangram',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
let copyToken=null,copyExpires=0;
async function copyleaksToken(){if(copyToken&&Date.now()<copyExpires)return copyToken;const email=process.env.COPYLEAKS_EMAIL,key=process.env.COPYLEAKS_API_KEY;if(!email||!key)return null;const r=await fetch('https://id.copyleaks.com/v3/account/login/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,key}),signal:timeout(15000)});const j=await r.json();if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);copyToken=j.access_token||j.accessToken;copyExpires=Date.now()+40*60*60*1000;return copyToken;}
async function copyleaks(text){
  if(!process.env.COPYLEAKS_EMAIL||!process.env.COPYLEAKS_API_KEY||text.length<255)return null;
  try{const token=await copyleaksToken();const id=crypto.randomUUID();const r=await fetch(`https://api.copyleaks.com/v2/writer-detector/${id}/check`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text:text.slice(0,100000),explain:true,sensitivity:3,sandbox:false}),signal:timeout(25000)});const j=await r.json();if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);const ai=Number(j.summary?.ai??j.ai??NaN),human=Number(j.summary?.human??j.human??NaN);let verdict='UNKNOWN';if(Number.isFinite(ai)&&Number.isFinite(human))verdict=ai>human?'AI':'HUMAN';return{provider:'Copyleaks',verdict,ai:Number.isFinite(ai)?ai:null,human:Number.isFinite(human)?human:null,modelVersion:j.version||j.modelVersion||null,segments:(j.results||j.sections||[]).slice(0,80)};}catch(e){return{provider:'Copyleaks',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
async function openAIProvenance(file){
  const key=process.env.OPENAI_API_KEY,mime=String(file.mimetype||'');if(!key||!(/^(image|audio)\//.test(mime)))return null;
  try{const fd=new FormData();fd.append('file',new Blob([file.buffer],{type:mime}),file.originalname||'asset');const r=await fetch('https://api.openai.com/v1/content_provenance_checks',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:fd,signal:timeout(30000)});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`HTTP ${r.status}`);const strings=recursiveStrings(j,[]),joined=strings.join(' ').toLowerCase(),detected=/\bdetected\b/.test(joined)&&!/not_detected|not detected/.test(joined);return{provider:'OpenAI provenance',verdict:detected?'VERIFIED_AI':'NOT_DETECTED',result:j.result||j.status||j.output?.[0]?.status||null,signals:strings.filter(x=>/synthid|c2pa|provenance|detected|watermark/i.test(x)).slice(0,30)};}catch(e){return{provider:'OpenAI provenance',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}

function localEnsemble(style,manipulation,segments,forensics={}){
  const panelScores=(style?.localPanels||[]).filter(p=>p.id!=='residue').map(p=>p.score);const meanPanel=mean(panelScores);const strongPanels=(style?.localPanels||[]).filter(p=>p.id!=='residue'&&p.score>=55).length;const prompt=manipulation?.promptResidue?.length||0;const evasion=manipulation?.evasionCount||0;const metadataAI=(forensics?.generatorFingerprints||[]).length>0;const processReview=(forensics?.processSignals||[]).filter(x=>x.type==='review').length;const mixed=segments?.changePoint?.mixedAuthorshipSignal;
  let score=meanPanel;const evidence=[];
  if(strongPanels>=3){score+=12;evidence.push(`${strongPanels} independent local style panels are strong`);}
  if(prompt){score+=25;evidence.push('assistant or prompt residue present');}
  if(evasion){score+=Math.min(12,evasion);evidence.push('text contains obfuscation/evasion characters');}
  if(metadataAI){score+=20;evidence.push('file metadata names an AI tool');}
  if(processReview){score+=8;evidence.push('document process metadata contains unusual timing/revision patterns');}
  if(mixed==='review'){evidence.push('large style shift between sections suggests mixed authorship or heavy editing');}
  score=clamp(score);
  const sampleWords=style?.words||0;let confidence='low';if(sampleWords>=650&&strongPanels>=3)confidence='medium-high';else if(sampleWords>=280&&strongPanels>=2)confidence='medium';else if(sampleWords>=140)confidence='low-medium';
  const verdict=prompt?'AI_RESIDUE':score>=72?'STRONG_LOCAL_AI_SIGNAL':score>=54?'MODERATE_LOCAL_AI_SIGNAL':score>=38?'WEAK_LOCAL_AI_SIGNAL':'NO_STRONG_LOCAL_AI_SIGNAL';
  return{verdict,score:round(score,1),confidence,strongPanels,evidence,mixedAuthorshipSignal:mixed||'none',sampleWords};
}
function consensus({providers,c2pa,style,manipulation,segments,forensics}){
  const usable=providers.filter(p=>p&&['AI','MIXED','HUMAN'].includes(p.verdict));const ai=usable.filter(p=>p.verdict==='AI').length,mixed=usable.filter(p=>p.verdict==='MIXED').length,human=usable.filter(p=>p.verdict==='HUMAN').length;
  const openVerified=providers.some(p=>p?.provider==='OpenAI provenance'&&p.verdict==='VERIFIED_AI');const verifiedC2pa=Boolean(c2pa?.manifestPresent&&c2pa?.validationPassed&&c2pa?.aiDeclared);const local=localEnsemble(style,manipulation,segments,forensics);
  if(openVerified||verifiedC2pa)return{verdict:'VERIFIED_AI_PROVENANCE',confidence:'verified',canProve:true,reason:openVerified?'A supported provider provenance signal was detected and verified.':'A valid C2PA Content Credential declares algorithmically generated media.',evidenceGrade:'cryptographic / provider provenance',local};
  if(ai+mixed>=2&&human===0)return{verdict:mixed?'AI_OR_AI_ASSISTED':'HIGH_AI_SIGNAL',confidence:'high',canProve:false,reason:`${ai+mixed} independent external detectors agree on AI or AI-assisted content.`,evidenceGrade:'multi-detector consensus',local};
  if(ai+mixed>=1&&local.score>=72&&human===0)return{verdict:'HIGH_AI_SIGNAL',confidence:'high',canProve:false,reason:'An external detector and the independent EMET local forensic ensemble both report strong AI-like evidence.',evidenceGrade:'external + local ensemble',local};
  if((ai+mixed)>=1&&human>=1)return{verdict:'INCONCLUSIVE',confidence:'low',canProve:false,reason:'Independent detectors disagree. EMET ONE does not convert disagreement into certainty.',evidenceGrade:'conflicting statistical evidence',local};
  if(ai+mixed===1)return{verdict:mixed?'AI_ASSISTED_SIGNAL':'AI_SIGNAL',confidence:'medium',canProve:false,reason:'One external detector reports an AI signal. The local ensemble is shown separately for corroboration.',evidenceGrade:'single external detector',local};
  if(local.verdict==='AI_RESIDUE')return{verdict:'AI_RESIDUE_FOUND',confidence:'medium-high',canProve:false,reason:'Direct assistant or prompt residue appears in the content. This is strong artifact evidence, but it still does not prove who produced the final document.',evidenceGrade:'content artifact + local ensemble',local};
  if(local.score>=72)return{verdict:'STRONG_LOCAL_AI_SIGNAL',confidence:local.confidence,canProve:false,reason:'Multiple independent local detectors agree on strong machine-like regularity. No cryptographic provenance is present.',evidenceGrade:'local multi-panel ensemble',local};
  if(local.score>=54)return{verdict:'MODERATE_LOCAL_AI_SIGNAL',confidence:local.confidence,canProve:false,reason:'Several local detectors report AI-like regularity, but the evidence is not sufficient for a verified attribution.',evidenceGrade:'local multi-panel ensemble',local};
  if(human>=2&&ai+mixed===0)return{verdict:'NO_AI_SIGNAL_FROM_ENSEMBLE',confidence:'medium',canProve:false,reason:'Multiple external detectors returned human-like results. This is not proof that AI was not used.',evidenceGrade:'multi-detector negative signal',local};
  return{verdict:'INCONCLUSIVE',confidence:'low',canProve:false,reason:'No trustworthy provenance or sufficiently strong independent evidence establishes AI origin.',evidenceGrade:'insufficient evidence',local};
}

async function analyzeAIFile(file){
  const extracted=await extractForAI(file);const text=String(extracted.text||'').slice(0,250000);const style=styleFeatures(text);const manipulation=manipulationSignals(text);const segments=windowAnalysis(text);
  const[c2pa,g,p,c,op]=await Promise.all([c2paCheck(file),gptZero(text),pangram(text),copyleaks(text),openAIProvenance(file)]);const providers=[g,p,c,op].filter(Boolean);const final=consensus({providers,c2pa,style,manipulation,segments,forensics:extracted.forensics});
  return{version:ENGINE_VERSION,final,provenance:{c2pa,openAI:op||null},providers:providers.filter(x=>x.provider!=='OpenAI provenance'),local:{style,manipulation,fileForensics:extracted.forensics,ensemble:final.local},segments:{local:segments.windows,changePoint:segments.changePoint,providers:Object.fromEntries(providers.filter(p=>Array.isArray(p.segments)&&p.segments.length).map(p=>[p.provider,p.segments]))},coverage:{textCharacters:text.length,textWords:tokenize(text).length,providersConfigured:{gptzero:Boolean(process.env.GPTZERO_API_KEY),pangram:Boolean(process.env.PANGRAM_API_KEY),copyleaks:Boolean(process.env.COPYLEAKS_EMAIL&&process.env.COPYLEAKS_API_KEY),openaiProvenance:Boolean(process.env.OPENAI_API_KEY)},c2pa:true,localPanels:(style.localPanels||[]).length},limitations:['Text-only AI detection cannot be guaranteed at 100% accuracy for arbitrary content.','Verified origin is reserved for trustworthy provenance or watermark evidence; absence of a watermark never proves human authorship.','Paraphrasing, translation, short samples, mixed authorship, domain shift and model drift can reduce reliability.']};
}
async function analyzeAIText(text){
  text=String(text||'').slice(0,250000);const style=styleFeatures(text),manipulation=manipulationSignals(text),segments=windowAnalysis(text);const[g,p,c]=await Promise.all([gptZero(text),pangram(text),copyleaks(text)]);const providers=[g,p,c].filter(Boolean);const final=consensus({providers,c2pa:null,style,manipulation,segments,forensics:{}});
  return{version:ENGINE_VERSION,final,provenance:{c2pa:null},providers,local:{style,manipulation,ensemble:final.local},segments:{local:segments.windows,changePoint:segments.changePoint,providers:Object.fromEntries(providers.filter(p=>Array.isArray(p.segments)&&p.segments.length).map(p=>[p.provider,p.segments]))},coverage:{textCharacters:text.length,textWords:tokenize(text).length,providersConfigured:{gptzero:Boolean(process.env.GPTZERO_API_KEY),pangram:Boolean(process.env.PANGRAM_API_KEY),copyleaks:Boolean(process.env.COPYLEAKS_EMAIL&&process.env.COPYLEAKS_API_KEY)},localPanels:(style.localPanels||[]).length},limitations:['Text-only AI detection is probabilistic. EMET ONE never labels statistical output as cryptographic proof.','Short, translated, paraphrased, heavily edited or mixed-authorship text can be intrinsically inconclusive.']};
}

module.exports={analyzeAIFile,analyzeAIText,styleFeatures,manipulationSignals,localEnsemble};
