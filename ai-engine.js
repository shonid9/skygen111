const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const ExifReader = require('exifreader');

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
  /i hope this helps/gi
];

function clamp(n,min=0,max=100){ return Math.max(min,Math.min(max,n)); }
function round(n,d=3){ const p=10**d; return Math.round(n*p)/p; }
function uniq(a){ return [...new Set((a||[]).filter(Boolean))]; }
function safeJson(v, fallback={}){ try { return typeof v==='string'?JSON.parse(v):v; } catch { return fallback; } }
function hash(s){ return crypto.createHash('sha256').update(String(s||'')).digest('hex'); }
function timeout(ms=15000){ return AbortSignal.timeout(ms); }
function recursiveStrings(v, out=[], depth=0){
  if(depth>8 || out.length>1200) return out;
  if(typeof v==='string') out.push(v);
  else if(Array.isArray(v)) for(const x of v) recursiveStrings(x,out,depth+1);
  else if(v && typeof v==='object') for(const [k,x] of Object.entries(v)){ out.push(k); recursiveStrings(x,out,depth+1); }
  return out;
}
function findToolNames(text){
  const low=String(text||'').toLowerCase();
  return AI_TOOL_NAMES.filter(x=>low.includes(x));
}

function splitSentences(text){
  return String(text||'').replace(/\r/g,'').split(/(?<=[.!?\u05C3])\s+(?=[\p{L}\p{N}"'“‘])/u).map(s=>s.trim()).filter(Boolean);
}
function tokenize(text){ return String(text||'').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]; }
function coeffVar(nums){
  if(!nums.length) return 0; const m=nums.reduce((a,b)=>a+b,0)/nums.length; if(!m) return 0;
  return Math.sqrt(nums.reduce((a,b)=>a+(b-m)**2,0)/nums.length)/m;
}
function shannon(items){
  if(!items.length) return 0; const m=new Map(); for(const x of items)m.set(x,(m.get(x)||0)+1);
  let h=0; for(const n of m.values()){const p=n/items.length;h-=p*Math.log2(p);} return h;
}
function repeatedNgramRatio(words,n=4){
  if(words.length<n*2) return 0; const m=new Map(); let total=0, repeated=0;
  for(let i=0;i<=words.length-n;i++){const g=words.slice(i,i+n).join(' ');m.set(g,(m.get(g)||0)+1);total++;}
  for(const c of m.values()) if(c>1) repeated += c-1;
  return total?repeated/total:0;
}
function scriptFlags(text){
  const tokens=String(text||'').split(/\s+/).filter(Boolean); let mixed=0;
  const examples=[];
  for(const t of tokens){
    const lat=/[A-Za-z]/.test(t), cyr=/[\u0400-\u04FF]/.test(t), greek=/[\u0370-\u03FF]/.test(t);
    if(lat && (cyr||greek)){ mixed++; if(examples.length<12)examples.push(t.slice(0,80)); }
  }
  return {mixedScriptTokens:mixed,examples};
}
function manipulationSignals(text){
  text=String(text||'');
  const zeroWidth=(text.match(/[\u200B\u200C\u200D\u2060\uFEFF]/g)||[]).length;
  const bidi=(text.match(/[\u202A-\u202E\u2066-\u2069]/g)||[]).length;
  const nbsp=(text.match(/\u00A0/g)||[]).length;
  const softHyphen=(text.match(/\u00AD/g)||[]).length;
  const scripts=scriptFlags(text);
  const prompt=[];
  for(const re of PROMPT_RESIDUE){ const n=(text.match(re)||[]).length; if(n)prompt.push({pattern:re.source,count:n}); }
  const severity = zeroWidth+bidi+softHyphen+scripts.mixedScriptTokens > 10 ? 'high' : zeroWidth+bidi+softHyphen+scripts.mixedScriptTokens ? 'review' : 'none';
  return {zeroWidth,bidiControls:bidi,nonBreakingSpaces:nbsp,softHyphens:softHyphen,mixedScriptTokens:scripts.mixedScriptTokens,mixedScriptExamples:scripts.examples,promptResidue:prompt,severity};
}
function styleFeatures(text){
  text=String(text||'').trim(); const words=tokenize(text); const sentences=splitSentences(text); const paras=text.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
  const lower=words.map(w=>w.toLowerCase()); const lens=sentences.map(s=>tokenize(s).length).filter(Boolean);
  const unique=new Set(lower); const counts=new Map(); lower.forEach(w=>counts.set(w,(counts.get(w)||0)+1));
  const hapax=[...counts.values()].filter(n=>n===1).length;
  const punctuation=(text.match(/[.,;:!?()—–\-"“”'’]/g)||[]);
  const starters=sentences.map(s=>tokenize(s).slice(0,3).join(' ').toLowerCase()).filter(Boolean);
  const starterRep=starters.length?1-new Set(starters).size/starters.length:0;
  const contractions=(text.match(/\b(?:\w+['’](?:t|s|re|ve|ll|d|m))\b/gi)||[]).length;
  const transitions=(text.match(/\b(?:moreover|furthermore|additionally|consequently|in conclusion|overall|therefore|on the other hand|it is important to note|in summary)\b/gi)||[]).length;
  const sentCv=coeffVar(lens), paraCv=coeffVar(paras.map(p=>tokenize(p).length));
  const ttr=words.length?unique.size/words.length:0; const hapaxRatio=unique.size?hapax/unique.size:0;
  const punctDiversity=punctuation.length?new Set(punctuation).size/Math.min(12,punctuation.length):0;
  const entropy=shannon(lower);
  const rep4=repeatedNgramRatio(lower,4);
  let score=0; const reasons=[];
  if(words.length>=120 && sentCv<0.34){score+=20;reasons.push('sentence-length distribution is unusually uniform');}
  if(words.length>=180 && paraCv>0 && paraCv<0.28){score+=12;reasons.push('paragraph lengths are unusually uniform');}
  if(words.length>=150 && starterRep>0.26){score+=12;reasons.push('sentence openings repeat at an unusual rate');}
  if(words.length>=150 && transitions/words.length>0.014){score+=12;reasons.push('formulaic transition density is elevated');}
  if(words.length>=180 && rep4>0.018){score+=12;reasons.push('repeated four-word phrasing is elevated');}
  if(words.length>=180 && ttr<0.39){score+=8;reasons.push('lexical diversity is low for the sample length');}
  if(words.length>=180 && punctDiversity<0.28){score+=8;reasons.push('punctuation variety is unusually narrow');}
  if(words.length>=180 && contractions/words.length<0.0015){score+=5;reasons.push('contractions are nearly absent');}
  const residue=PROMPT_RESIDUE.reduce((n,re)=>n+(text.match(re)||[]).length,0);
  if(residue){score+=25;reasons.push('assistant or prompt residue is present in the text');}
  return {
    words:words.length,sentences:sentences.length,paragraphs:paras.length,
    sentenceCv:round(sentCv),paragraphCv:round(paraCv),typeTokenRatio:round(ttr),hapaxRatio:round(hapaxRatio),
    lexicalEntropy:round(entropy),punctuationDiversity:round(punctDiversity),sentenceStarterRepetition:round(starterRep),
    repeatedFourgramRatio:round(rep4),transitionDensity:round(words.length?transitions/words.length:0,4),contractionRate:round(words.length?contractions/words.length:0,4),
    regularityScore:clamp(score),reasons,
    interpretation:score>=60?'strong statistical regularity':score>=35?'moderate statistical regularity':'weak statistical regularity',
    note:'Statistical writing patterns are not proof of AI authorship and are never treated as verified provenance.'
  };
}
function windowAnalysis(text){
  const sentences=splitSentences(text); const windows=[]; let bucket=[],count=0,start=0,offset=0;
  for(const s of sentences){
    const w=tokenize(s).length; if(count>=170 && count+w>280){
      const chunk=bucket.join(' '); const f=styleFeatures(chunk); windows.push({index:windows.length,startChar:start,endChar:start+chunk.length,words:f.words,regularityScore:f.regularityScore,label:f.interpretation,reasons:f.reasons});
      offset=start+chunk.length; start=offset+1; bucket=[];count=0;
    }
    bucket.push(s); count+=w;
  }
  if(bucket.length){const chunk=bucket.join(' ');const f=styleFeatures(chunk);windows.push({index:windows.length,startChar:start,endChar:start+chunk.length,words:f.words,regularityScore:f.regularityScore,label:f.interpretation,reasons:f.reasons});}
  return windows.slice(0,40);
}

function xmlText(entry){try{return entry.getData().toString('utf8')}catch{return''}}
function extractOffice(buffer,ext){
  const zip=new AdmZip(buffer); const entries=zip.getEntries(); const names=entries.map(e=>e.entryName); const chunks=[];
  const readNames=[];
  if(['.docx','.docm'].includes(ext)) readNames.push(...names.filter(n=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(n)));
  if(['.pptx','.pptm'].includes(ext)) readNames.push(...names.filter(n=>/^ppt\/(slides|notesSlides)\/[^/]+\.xml$/i.test(n)));
  if(['.xlsx','.xlsm'].includes(ext)) readNames.push(...names.filter(n=>/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/i.test(n)));
  for(const n of readNames){const e=zip.getEntry(n);if(!e)continue;const x=xmlText(e);for(const m of x.matchAll(/<(?:w:t|w:delText|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|w:delText|a:t|t)>/gi))chunks.push(m[1].replace(/<[^>]+>/g,''));}
  const metaNames=names.filter(n=>/^docProps\//i.test(n)||/settings\.xml$/i.test(n)||/\.rels$/i.test(n)||/customXml\//i.test(n));
  const metaRaw=metaNames.map(n=>xmlText(zip.getEntry(n))).join('\n');
  const allXml=entries.filter(e=>/\.xml$/i.test(e.entryName)).map(xmlText).join('\n');
  const authors=uniq([...allXml.matchAll(/w:author="([^"]+)"/gi)].map(m=>m[1])).slice(0,40);
  const hidden=(allXml.match(/<w:(?:vanish|webHidden)\b/gi)||[]).length;
  const altChunks=(allXml.match(/<w:altChunk\b/gi)||[]).length;
  const tracked=(allXml.match(/<w:(?:ins|del|moveFrom|moveTo)\b/gi)||[]).length;
  const commentCount=(allXml.match(/<w:comment\b/gi)||[]).length;
  const external=(metaRaw.match(/TargetMode="External"/gi)||[]).length;
  const totalTime=(metaRaw.match(/<TotalTime>(\d+)<\/TotalTime>/i)||[])[1]||null;
  const pages=(metaRaw.match(/<Pages>(\d+)<\/Pages>/i)||[])[1]||null;
  const words=(metaRaw.match(/<Words>(\d+)<\/Words>/i)||[])[1]||null;
  const lastPrinted=(metaRaw.match(/<[^>]*:?lastPrinted[^>]*>([^<]+)</i)||[])[1]||null;
  const generatorFingerprints=findToolNames(metaRaw);
  return {text:chunks.join(' ').replace(/\s+/g,' ').trim(),forensics:{packageParts:names.length,revisionAuthors:authors,hiddenTextProperties:hidden,altChunkImports:altChunks,trackedRevisionMarkers:tracked,commentRecords:commentCount,externalRelationships:external,totalEditingMinutes:totalTime?Number(totalTime):null,reportedPages:pages?Number(pages):null,reportedWords:words?Number(words):null,lastPrinted,generatorFingerprints,macroPayload:names.some(n=>/vbaProject\.bin$/i.test(n)),digitalSignatureParts:names.filter(n=>/_xmlsignatures\//i.test(n)).length,customXmlParts:names.filter(n=>/^customXml\//i.test(n)).length}};
}
async function extractPdf(buffer){
  const d=await pdfParse(buffer); const latin=buffer.toString('latin1');
  const eof=(latin.match(/%%EOF/g)||[]).length, sx=(latin.match(/startxref/g)||[]).length;
  const sig=(latin.match(/\/Type\s*\/Sig\b|\/ByteRange\s*\[/g)||[]).length;
  const js=(latin.match(/\/JavaScript\b|\/JS\s*[<(]/g)||[]).length;
  const embedded=(latin.match(/\/EmbeddedFile\b/g)||[]).length;
  const forms=(latin.match(/\/AcroForm\b/g)||[]).length;
  const xrefStreams=(latin.match(/\/Type\s*\/XRef\b/g)||[]).length;
  const meta=JSON.stringify(d.info||{})+' '+String(d.metadata||'');
  return {text:d.text||'',forensics:{pages:d.numpages||0,eofMarkers:eof,startXrefMarkers:sx,incrementalUpdateLikely:eof>1||sx>1,pdfSignatureMarkers:sig,embeddedFiles:embedded,javascriptActions:js,acroFormMarkers:forms,xrefStreams,generatorFingerprints:findToolNames(meta),producer:d.info?.Producer||null,creator:d.info?.Creator||null,creationDate:d.info?.CreationDate||null,modificationDate:d.info?.ModDate||null}};
}
function extractImage(buffer){
  let tags={};try{tags=ExifReader.load(buffer,{expanded:true})}catch{}
  const vals=[]; const walk=(v,d=0)=>{if(d>5||!v)return;if(typeof v==='string'||typeof v==='number')vals.push(String(v));else if(Array.isArray(v))v.slice(0,80).forEach(x=>walk(x,d+1));else if(typeof v==='object')Object.entries(v).slice(0,180).forEach(([k,x])=>{vals.push(k);if(x&&typeof x==='object'&&'description'in x)vals.push(String(x.description));else walk(x,d+1)});};walk(tags);
  const raw=vals.join(' ');return {text:'',forensics:{metadataFieldEstimate:vals.length,generatorFingerprints:findToolNames(raw)}};
}
async function extractForAI(file){
  const ext=path.extname(file.originalname||'').toLowerCase(); const b=file.buffer;
  if(['.docx','.docm','.pptx','.pptm','.xlsx','.xlsm'].includes(ext))return extractOffice(b,ext);
  if(ext==='.pdf')return await extractPdf(b);
  if(['.jpg','.jpeg','.png','.webp','.gif','.tif','.tiff'].includes(ext))return extractImage(b);
  if(ext==='.eml'){const s=b.toString('utf8');return{text:s.split(/\r?\n\r?\n/).slice(1).join('\n\n'),forensics:{generatorFingerprints:findToolNames(s.slice(0,12000))}};}
  if(['.txt','.md','.csv','.json','.xml','.html','.htm','.js','.ts','.tsx','.jsx','.py','.java','.c','.cpp','.cs','.go','.rs','.php','.rb','.sql','.sh','.yaml','.yml'].includes(ext)||String(file.mimetype||'').startsWith('text/'))return{text:b.toString('utf8'),forensics:{}};
  return{text:'',forensics:{}};
}

async function c2paCheck(file){
  const ext=path.extname(file.originalname||'')||'.bin'; const tmp=path.join(os.tmpdir(),`emet-${crypto.randomUUID()}${ext}`);
  try{
    fs.writeFileSync(tmp,file.buffer);
    const {Reader}=await import('@contentauth/c2pa-node');
    const reader=await Reader.fromAsset({path:tmp});
    let store=typeof reader.json==='function'?await reader.json():{}; store=safeJson(store,store||{});
    let active=null; try{active=typeof reader.getActive==='function'?await reader.getActive():null}catch{}
    let embedded=null; try{embedded=typeof reader.isEmbedded==='function'?await reader.isEmbedded():null}catch{}
    const strings=recursiveStrings(store,[]); const joined=strings.join(' ');
    const aiDeclared=/trainedAlgorithmicMedia|algorithmicMedia|generative.?ai|ai.?generated|digitalSourceType[^\n]{0,80}algorithm/i.test(joined);
    const bad=strings.filter(x=>/validation|signature|trust|certificate/i.test(x)).some(x=>/invalid|error|failure|untrusted|mismatch/i.test(x));
    const manifestCount=store?.manifests?Object.keys(store.manifests).length:(joined?1:0);
    return {available:true,manifestPresent:manifestCount>0,embedded,manifestCount,aiDeclared,validationPassed:manifestCount>0&&!bad,claimGenerator:active?.claim_generator||active?.claimGenerator||null,activeTitle:active?.title||null,summary:strings.filter(x=>/c2pa|source|action|generator|algorithm|validation/i.test(x)).slice(0,40)};
  }catch(e){return{available:true,manifestPresent:false,error:e.message?.slice(0,240)||'C2PA read failed'};}
  finally{try{fs.unlinkSync(tmp)}catch{}}
}

async function gptZero(text){
  const key=process.env.GPTZERO_API_KEY; if(!key||tokenize(text).length<80)return null;
  try{
    const r=await fetch('https://api.gptzero.me/v2/predict/text',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({document:text.slice(0,120000)}),signal:timeout(20000)});
    const j=await r.json(); if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);
    const d=j.documents?.[0]||j.document||j; const cls=String(d.document_classification||d.classification||d.prediction||'').toUpperCase();
    const probs=d.class_probabilities||d.probabilities||{}; const verdict=cls.includes('AI_ONLY')||cls==='AI'?'AI':cls.includes('MIXED')?'MIXED':cls.includes('HUMAN')?'HUMAN':'UNKNOWN';
    return {provider:'GPTZero',verdict,classification:cls||null,confidence:d.confidence_category||d.confidence||null,probabilities:probs,segments:(d.sentences||d.sentence_results||[]).slice(0,80)};
  }catch(e){return{provider:'GPTZero',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
async function pangram(text){
  const key=process.env.PANGRAM_API_KEY; if(!key||tokenize(text).length<80)return null;
  try{
    const r=await fetch('https://text.api.pangram.com/v3',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({text:text.slice(0,120000)}),signal:timeout(20000)});
    const j=await r.json(); if(!r.ok)throw new Error(j?.detail||j?.message||`HTTP ${r.status}`);
    const p=String(j.prediction_short||j.prediction||'').toUpperCase(); const verdict=p.includes('AI-ASSISTED')||p.includes('MIXED')?'MIXED':p==='AI'||p.includes('AI GENERATED')?'AI':p.includes('HUMAN')?'HUMAN':'UNKNOWN';
    return {provider:'Pangram',verdict,classification:j.prediction_short||j.prediction||null,fractionAI:j.fraction_ai??null,fractionAIAssisted:j.fraction_ai_assisted??null,fractionHuman:j.fraction_human??null,segments:(j.windows||j.segments||[]).slice(0,80)};
  }catch(e){return{provider:'Pangram',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
let copyToken=null,copyExpires=0;
async function copyleaksToken(){
  if(copyToken&&Date.now()<copyExpires)return copyToken;
  const email=process.env.COPYLEAKS_EMAIL,key=process.env.COPYLEAKS_API_KEY;if(!email||!key)return null;
  const r=await fetch('https://id.copyleaks.com/v3/account/login/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,key}),signal:timeout(15000)});const j=await r.json();if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);copyToken=j.access_token||j.accessToken;copyExpires=Date.now()+40*60*60*1000;return copyToken;
}
async function copyleaks(text){
  if(!process.env.COPYLEAKS_EMAIL||!process.env.COPYLEAKS_API_KEY||text.length<255)return null;
  try{
    const token=await copyleaksToken(); const id=crypto.randomUUID();
    const r=await fetch(`https://api.copyleaks.com/v2/writer-detector/${id}/check`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({text:text.slice(0,100000),explain:true,sensitivity:3,sandbox:false}),signal:timeout(25000)});
    const j=await r.json();if(!r.ok)throw new Error(j?.message||`HTTP ${r.status}`);
    const ai=Number(j.summary?.ai??j.ai??NaN), human=Number(j.summary?.human??j.human??NaN); let verdict='UNKNOWN'; if(Number.isFinite(ai)&&Number.isFinite(human))verdict=ai>human?'AI':'HUMAN';
    return {provider:'Copyleaks',verdict,ai:Number.isFinite(ai)?ai:null,human:Number.isFinite(human)?human:null,modelVersion:j.version||j.modelVersion||null,segments:(j.results||j.sections||[]).slice(0,80)};
  }catch(e){return{provider:'Copyleaks',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
async function openAIProvenance(file){
  const key=process.env.OPENAI_API_KEY; const mime=String(file.mimetype||''); if(!key||!(/^(image|audio)\//.test(mime)))return null;
  try{
    const fd=new FormData();fd.append('file',new Blob([file.buffer],{type:mime}),file.originalname||'asset');
    const r=await fetch('https://api.openai.com/v1/content_provenance_checks',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:fd,signal:timeout(30000)});const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`HTTP ${r.status}`);
    const strings=recursiveStrings(j,[]); const joined=strings.join(' ').toLowerCase(); const detected=/\bdetected\b/.test(joined)&&!/not_detected|not detected/.test(joined);
    return {provider:'OpenAI provenance',verdict:detected?'VERIFIED_AI':'NOT_DETECTED',result:j.result||j.status||j.output?.[0]?.status||null,signals:strings.filter(x=>/synthid|c2pa|provenance|detected|watermark/i.test(x)).slice(0,30)};
  }catch(e){return{provider:'OpenAI provenance',verdict:'UNAVAILABLE',error:e.message?.slice(0,220)}}
}
function consensus({providers,c2pa,style,manipulation,forensics}){
  const usable=providers.filter(p=>p&&['AI','MIXED','HUMAN'].includes(p.verdict)); const ai=usable.filter(p=>p.verdict==='AI').length; const mixed=usable.filter(p=>p.verdict==='MIXED').length; const human=usable.filter(p=>p.verdict==='HUMAN').length;
  const openVerified=providers.some(p=>p?.provider==='OpenAI provenance'&&p.verdict==='VERIFIED_AI');
  const verifiedC2pa=Boolean(c2pa?.manifestPresent&&c2pa?.validationPassed&&c2pa?.aiDeclared);
  const metadataAI=(forensics?.generatorFingerprints||[]).length>0;
  if(openVerified||verifiedC2pa)return{verdict:'VERIFIED_AI_PROVENANCE',confidence:'verified',canProve:true,reason:openVerified?'A supported provider provenance signal was detected and verified.':'A valid C2PA Content Credential declares algorithmically generated media.',evidenceGrade:'cryptographic / provider provenance'};
  if(ai+mixed>=2&&human===0)return{verdict:mixed?'AI_OR_AI_ASSISTED':'HIGH_AI_SIGNAL',confidence:'high',canProve:false,reason:`${ai+mixed} independent detector providers agree on AI or AI-assisted content.`,evidenceGrade:'multi-detector consensus'};
  if((ai+mixed)>=1&&human>=1)return{verdict:'INCONCLUSIVE',confidence:'low',canProve:false,reason:'Independent detectors disagree. EMET ONE will not turn disagreement into certainty.',evidenceGrade:'conflicting statistical evidence'};
  if(ai+mixed===1)return{verdict:mixed?'AI_ASSISTED_SIGNAL':'AI_SIGNAL',confidence:'medium',canProve:false,reason:'One external detector reports an AI signal; independent confirmation is not available.',evidenceGrade:'single-provider statistical signal'};
  if(metadataAI)return{verdict:'AI_TOOL_METADATA_FOUND',confidence:'medium',canProve:false,reason:'The file metadata names an AI-generation or AI-assistance tool. Metadata can be altered, so it is supporting evidence rather than proof.',evidenceGrade:'file metadata evidence'};
  if(manipulation?.promptResidue?.length)return{verdict:'AI_RESIDUE_FOUND',confidence:'medium',canProve:false,reason:'Assistant or prompt residue was found in the content, but this alone does not establish authorship.',evidenceGrade:'content artifact'};
  if(style?.regularityScore>=60)return{verdict:'AI_STYLE_SIGNAL',confidence:'low',canProve:false,reason:'The prose has strong machine-like statistical regularity, with no provenance proof.',evidenceGrade:'local statistical signal'};
  if(human>=2&&ai+mixed===0)return{verdict:'NO_AI_SIGNAL_FROM_ENSEMBLE',confidence:'medium',canProve:false,reason:'Multiple detectors returned human-like results. This is not proof that AI was not used.',evidenceGrade:'multi-detector negative signal'};
  return{verdict:'INCONCLUSIVE',confidence:'low',canProve:false,reason:'No trustworthy provenance or multi-detector consensus establishes AI origin.',evidenceGrade:'insufficient evidence'};
}

async function analyzeAIFile(file){
  const extracted=await extractForAI(file); const text=String(extracted.text||'').slice(0,250000); const style=styleFeatures(text); const manipulation=manipulationSignals(text); const windows=windowAnalysis(text);
  const [c2pa,g,p,c,op]=await Promise.all([c2paCheck(file),gptZero(text),pangram(text),copyleaks(text),openAIProvenance(file)]);
  const providers=[g,p,c,op].filter(Boolean); const final=consensus({providers,c2pa,style,manipulation,forensics:extracted.forensics});
  return {version:'EMET-AI-2026.09',final,provenance:{c2pa,openAI:op||null},providers:providers.filter(x=>x.provider!=='OpenAI provenance'),local:{style,manipulation,fileForensics:extracted.forensics},segments:{local:windows,providers:Object.fromEntries(providers.filter(p=>Array.isArray(p.segments)&&p.segments.length).map(p=>[p.provider,p.segments]))},coverage:{textCharacters:text.length,textWords:tokenize(text).length,providersConfigured:{gptzero:Boolean(process.env.GPTZERO_API_KEY),pangram:Boolean(process.env.PANGRAM_API_KEY),copyleaks:Boolean(process.env.COPYLEAKS_EMAIL&&process.env.COPYLEAKS_API_KEY),openaiProvenance:Boolean(process.env.OPENAI_API_KEY)},c2pa:true},limitations:['No statistical detector can provide 100% proof of AI authorship for arbitrary text.','Verified origin is reserved for trustworthy provenance or watermark evidence; a missing watermark never proves human authorship.','Paraphrasing, translation, short samples, mixed authorship and model drift can reduce detector reliability.']};
}
async function analyzeAIText(text){
  text=String(text||'').slice(0,250000); const style=styleFeatures(text), manipulation=manipulationSignals(text), windows=windowAnalysis(text); const [g,p,c]=await Promise.all([gptZero(text),pangram(text),copyleaks(text)]); const providers=[g,p,c].filter(Boolean); const final=consensus({providers,c2pa:null,style,manipulation,forensics:{}});
  return {version:'EMET-AI-2026.09',final,provenance:{c2pa:null},providers,local:{style,manipulation},segments:{local:windows,providers:Object.fromEntries(providers.filter(p=>Array.isArray(p.segments)&&p.segments.length).map(p=>[p.provider,p.segments]))},coverage:{textCharacters:text.length,textWords:tokenize(text).length,providersConfigured:{gptzero:Boolean(process.env.GPTZERO_API_KEY),pangram:Boolean(process.env.PANGRAM_API_KEY),copyleaks:Boolean(process.env.COPYLEAKS_EMAIL&&process.env.COPYLEAKS_API_KEY)}},limitations:['Text-only AI detection is probabilistic. EMET ONE never labels statistical output as cryptographic proof.','Short, translated, paraphrased or heavily edited text can be intrinsically inconclusive.']};
}

module.exports={analyzeAIFile,analyzeAIText,styleFeatures,manipulationSignals};
