const crypto = require('crypto');
const path = require('path');
const AdmZip = require('adm-zip');
const pdfParse = require('pdf-parse');
const ExifReader = require('exifreader');

const esc = s => String(s ?? '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const tag = (xml, name) => {
  const m = String(xml || '').match(new RegExp(`<[^>]*:?${name}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${name}>`, 'i'));
  return m ? esc(m[1].replace(/<[^>]+>/g,'').trim()) : null;
};
const attr = (s, name) => {
  const m = String(s || '').match(new RegExp(`(?:\\w+:)?${name}="([^"]*)"`, 'i'));
  return m ? esc(m[1]) : null;
};
const count = (s, re) => (String(s || '').match(re) || []).length;
const uniq = arr => [...new Set(arr.filter(Boolean))];

function sha256(buffer){ return crypto.createHash('sha256').update(buffer).digest('hex'); }
function entropy(buffer){
  if (!buffer.length) return 0;
  const f = new Array(256).fill(0); for (const b of buffer) f[b]++;
  let h=0; for (const n of f) if(n){ const p=n/buffer.length; h -= p*Math.log2(p); }
  return Number(h.toFixed(3));
}
function magic(buffer){
  const h = buffer.subarray(0,12).toString('hex');
  if (h.startsWith('504b0304')) return 'ZIP / OOXML container';
  if (buffer.subarray(0,5).toString() === '%PDF-') return 'PDF';
  if (h.startsWith('89504e470d0a1a0a')) return 'PNG';
  if (h.startsWith('ffd8ff')) return 'JPEG';
  if (h.startsWith('d0cf11e0a1b11ae1')) return 'OLE Compound Binary';
  return 'Unknown / text-like';
}
function textStats(text){
  text = String(text || '').replace(/\s+/g,' ').trim();
  const words = text ? text.split(/\s+/) : [];
  const sentences = text ? text.split(/(?<=[.!?])\s+/).filter(Boolean) : [];
  const paragraphs = String(text || '').split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const lens = sentences.map(s => s.split(/\s+/).filter(Boolean).length).filter(Boolean);
  const mean = lens.length ? lens.reduce((a,b)=>a+b,0)/lens.length : 0;
  const variance = lens.length ? lens.reduce((a,b)=>a+(b-mean)**2,0)/lens.length : 0;
  const burst = mean ? Math.sqrt(variance)/mean : 0;
  const lower = words.map(w=>w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu,''));
  const uniqueRatio = lower.length ? new Set(lower).size/lower.length : 0;
  const transitions = ['moreover','furthermore','in conclusion','additionally','overall','it is important to note','on the other hand','therefore','consequently'];
  const low = text.toLowerCase();
  const transitionHits = transitions.reduce((n,t)=>n+(low.split(t).length-1),0);
  let aiStyle = 0; const reasons=[];
  if (words.length >= 120 && burst < .42){ aiStyle += 32; reasons.push('Sentence lengths are unusually uniform.'); }
  if (words.length >= 120 && uniqueRatio < .43){ aiStyle += 18; reasons.push('Vocabulary diversity is relatively low for the sample length.'); }
  if (transitionHits >= Math.max(3, words.length/180)){ aiStyle += 22; reasons.push('High density of formulaic transition phrases.'); }
  if (paragraphs.length >= 4){
    const pl = paragraphs.map(p=>p.split(/\s+/).length); const pm=pl.reduce((a,b)=>a+b,0)/pl.length; const pv=pl.reduce((a,b)=>a+(b-pm)**2,0)/pl.length; const pcv=pm?Math.sqrt(pv)/pm:1;
    if (pcv < .28){ aiStyle += 18; reasons.push('Paragraph lengths are unusually even.'); }
  }
  aiStyle = Math.min(100, aiStyle);
  return {
    characters:text.length, words:words.length, sentences:sentences.length, paragraphs:paragraphs.length,
    averageSentenceWords:Number(mean.toFixed(1)), sentenceBurstiness:Number(burst.toFixed(3)), uniqueWordRatio:Number(uniqueRatio.toFixed(3)),
    aiStyleSignal:{score:aiStyle, label:aiStyle>=60?'strong style regularity':aiStyle>=35?'moderate style regularity':'weak style regularity', reasons,
      note:'This is a writing-style signal, not proof that AI wrote the text. Authorship cannot be established reliably from prose alone.'}
  };
}

function zipText(entry){ try { return entry.getData().toString('utf8'); } catch { return ''; } }
function getEntry(zip, name){ const e = zip.getEntry(name); return e ? zipText(e) : ''; }

function officeText(zip, ext){
  const entries = zip.getEntries(); let chunks=[];
  if (ext === '.docx' || ext === '.docm') {
    for (const e of entries.filter(e=>/^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(e.entryName))){
      const x=zipText(e); chunks.push(...[...x.matchAll(/<w:(?:t|delText)[^>]*>([\s\S]*?)<\/w:(?:t|delText)>/g)].map(m=>esc(m[1])));
    }
  } else if (ext === '.pptx' || ext === '.pptm') {
    for (const e of entries.filter(e=>/^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))){ const x=zipText(e); chunks.push(...[...x.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map(m=>esc(m[1]))); }
  } else if (ext === '.xlsx' || ext === '.xlsm') {
    const x=getEntry(zip,'xl/sharedStrings.xml'); chunks.push(...[...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>esc(m[1])));
  }
  return chunks.join(' ').replace(/\s+/g,' ').trim();
}

function analyzeOffice(buffer, ext){
  const zip = new AdmZip(buffer); const entries = zip.getEntries(); const names = entries.map(e=>e.entryName);
  const core = getEntry(zip,'docProps/core.xml'); const app = getEntry(zip,'docProps/app.xml'); const custom = getEntry(zip,'docProps/custom.xml');
  const xmlAll = entries.filter(e=>/\.xml$/i.test(e.entryName)).map(zipText).join('\n');
  const docXml = ext.startsWith('.doc') ? getEntry(zip,'word/document.xml') : '';
  const settings = getEntry(zip,'word/settings.xml');
  const relXml = entries.filter(e=>/\.rels$/i.test(e.entryName)).map(zipText).join('\n');
  const externalTargets = [...relXml.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"/gi)].map(m=>esc(m[1]));
  const localPathLeaks = uniq(externalTargets.filter(x=>/^(?:file:|[A-Za-z]:\\|\\\\)/i.test(x)));
  const rsids = uniq([...xmlAll.matchAll(/w:rsid(?:R|RPr|Del|P|Sect)?="([0-9A-F]+)"/gi)].map(m=>m[1])).slice(0,120);
  const revisionEvents = [];
  for (const m of docXml.matchAll(/<w:(ins|del|moveFrom|moveTo)\b([^>]*)>/gi)){
    if (revisionEvents.length>=80) break;
    revisionEvents.push({type:m[1], author:attr(m[2],'author'), date:attr(m[2],'date'), id:attr(m[2],'id')});
  }
  const zipTimes = entries.map(e=>e.header && e.header.time instanceof Date ? e.header.time : null).filter(Boolean).map(d=>d.toISOString());
  const created = tag(core,'created'), modified=tag(core,'modified');
  let lifetimeHours=null;
  if(created && modified){ const a=Date.parse(created), b=Date.parse(modified); if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a) lifetimeHours=Number(((b-a)/36e5).toFixed(2)); }
  const text = officeText(zip, ext);
  const insertions=count(docXml,/<w:ins\b/gi), deletions=count(docXml,/<w:del\b/gi), moveFrom=count(docXml,/<w:moveFrom\b/gi), moveTo=count(docXml,/<w:moveTo\b/gi);
  const comments = names.filter(n=>/(comments|threadedComments)\d*\.xml$/i.test(n)).length;
  const embedded = names.filter(n=>/(embeddings|oleObject|media)\//i.test(n));
  const macros = names.filter(n=>/vbaProject\.bin$/i.test(n));
  const customXml = names.filter(n=>/^customXml\//i.test(n));
  const people = names.filter(n=>/people\.xml$/i.test(n));
  const signatures = names.filter(n=>/_xmlsignatures\//i.test(n));
  const appName = tag(app,'Application');
  const company = tag(app,'Company');
  const template = tag(app,'Template');
  const findings=[];
  if (insertions+deletions+moveFrom+moveTo) findings.push({severity:'info',category:'revision',title:'Tracked revision records found',detail:`${insertions} insertions, ${deletions} deletions, ${moveFrom+moveTo} move operations are stored in the package.`});
  if (rsids.length>20) findings.push({severity:'review',category:'revision',title:'Many edit-session identifiers',detail:`${rsids.length} distinct Word revision/session IDs are visible. They can mark editing boundaries but do not prove who typed or pasted text.`});
  if (externalTargets.length) findings.push({severity:'review',category:'relationships',title:'External relationships present',detail:`${externalTargets.length} external link(s) or relationship target(s) are embedded in the file.`});
  if (localPathLeaks.length) findings.push({severity:'conflict',category:'privacy',title:'Local path information exposed',detail:'The package contains relationship targets that may reveal a local path or originating environment.'});
  if (macros.length) findings.push({severity:'conflict',category:'security',title:'Macro payload present',detail:'VBA macro content exists inside the Office package.'});
  if (created && modified && Date.parse(modified)<Date.parse(created)) findings.push({severity:'conflict',category:'time',title:'Modified date predates creation date',detail:`Created ${created}; modified ${modified}.`});
  return {
    engine:'OOXML forensic parser',
    metadata:{creator:tag(core,'creator'), lastModifiedBy:tag(core,'lastModifiedBy'), created, modified, revision:tag(core,'revision'), title:tag(core,'title'), subject:tag(core,'subject'), keywords:tag(core,'keywords'), application:appName, company, template},
    provenance:{lifetimeHours, zipEarliest:zipTimes.sort()[0]||null, zipLatest:zipTimes.sort().at(-1)||null, localPathLeaks, externalTargets:externalTargets.slice(0,30)},
    revisions:{trackedChangesEnabled:/<w:trackRevisions\b/i.test(settings), insertions,deletions,moveFrom,moveTo,rsidCount:rsids.length,rsids,events:revisionEvents},
    structure:{parts:names.length, commentsFiles:comments, embeddedObjects:embedded.length, macros:macros.length, customXmlParts:customXml.length, peopleParts:people.length, digitalSignatureParts:signatures.length, entrySample:names.slice(0,80)},
    text:textStats(text), findings,
    limitations:['Word/Office files do not normally store a complete keystroke history.','A paste operation is not reliably recoverable as a discrete event unless another artifact records it.','RSIDs, formatting changes and tracked changes can reveal edit boundaries, but they are evidence signals rather than proof of copy/paste or authorship.']
  };
}

async function analyzePdf(buffer){
  const d = await pdfParse(buffer); const info=d.info||{}, meta=d.metadata||null;
  return {engine:'PDF parser',metadata:info,provenance:{pdfVersion:info.PDFFormatVersion||null,producer:info.Producer||null,creator:info.Creator||null,creationDate:info.CreationDate||null,modificationDate:info.ModDate||null,metadataObject:meta?String(meta).slice(0,1200):null},structure:{pages:d.numpages||0},text:textStats(d.text||''),findings:[],limitations:['PDF metadata can be edited or stripped and should not be treated as proof on its own.']};
}

function analyzeEml(buffer){
  const s=buffer.toString('utf8'); const [rawHeaders,...rest]=s.split(/\r?\n\r?\n/); const headers={}; let last=null;
  for(const line of rawHeaders.split(/\r?\n/)){
    if(/^\s/.test(line)&&last) headers[last]+=' '+line.trim(); else { const i=line.indexOf(':'); if(i>0){ last=line.slice(0,i).toLowerCase(); headers[last]=line.slice(i+1).trim(); }}
  }
  const received = rawHeaders.match(/^Received:.*(?:\r?\n[ \t].*)*/gmi)||[];
  const auth = headers['authentication-results']||'';
  const findings=[];
  if(headers.from && headers['reply-to'] && !headers['reply-to'].includes((headers.from.match(/@([^>\s]+)/)||[])[1]||'___')) findings.push({severity:'review',category:'email',title:'Reply-To differs from sender identity',detail:`From: ${headers.from}; Reply-To: ${headers['reply-to']}`});
  if(auth && /spf=fail|dkim=fail|dmarc=fail/i.test(auth)) findings.push({severity:'conflict',category:'email',title:'Email authentication failure recorded',detail:auth.slice(0,500)});
  return {engine:'RFC 5322 header parser',metadata:{from:headers.from,to:headers.to,subject:headers.subject,date:headers.date,'message-id':headers['message-id'],'reply-to':headers['reply-to']},provenance:{receivedHops:received.length,authenticationResults:auth||null,returnPath:headers['return-path']||null},structure:{headerCount:Object.keys(headers).length},text:textStats(rest.join('\n\n')),findings,limitations:['Forwarding, export tools and mail gateways can rewrite headers; original server records are stronger evidence when available.']};
}

function analyzeImage(buffer){
  let tags={}; try { tags=ExifReader.load(buffer,{expanded:true}); } catch {}
  const flat={};
  const walk=(o,p='')=>{ if(!o||typeof o!=='object')return; for(const [k,v] of Object.entries(o)){ const key=p?`${p}.${k}`:k; if(v&&typeof v==='object'&&'description' in v) flat[key]=v.description; else if(v&&typeof v==='object'&&Object.keys(flat).length<120) walk(v,key); }}; walk(tags);
  const findings=[]; if(Object.keys(flat).length===0) findings.push({severity:'unknown',category:'metadata',title:'No readable EXIF metadata',detail:'Metadata may never have existed or may have been stripped during upload/export.'});
  return {engine:'EXIF parser',metadata:flat,provenance:{software:Object.entries(flat).find(([k])=>/software/i.test(k))?.[1]||null,date:Object.entries(flat).find(([k])=>/date.?time/i.test(k))?.[1]||null,gps:Object.fromEntries(Object.entries(flat).filter(([k])=>/gps/i.test(k)).slice(0,20))},structure:{metadataFields:Object.keys(flat).length},findings,limitations:['Image metadata is mutable and often removed by messaging and social platforms.']};
}

async function analyzeFile(file){
  const buffer=file.buffer; const ext=path.extname(file.originalname||'').toLowerCase(); const base={name:file.originalname,size:buffer.length,mime:file.mimetype||null,extension:ext,sha256:sha256(buffer),entropy:entropy(buffer),magic:magic(buffer)};
  let deep={engine:'generic binary inspection',metadata:{},provenance:{},structure:{},text:null,findings:[],limitations:[]};
  try{
    if(['.docx','.docm','.xlsx','.xlsm','.pptx','.pptm'].includes(ext) || magic(buffer).includes('OOXML')) deep=analyzeOffice(buffer,ext);
    else if(ext==='.pdf'||buffer.subarray(0,5).toString()==='%PDF-') deep=await analyzePdf(buffer);
    else if(['.jpg','.jpeg','.png','.webp','.tif','.tiff'].includes(ext)) deep=analyzeImage(buffer);
    else if(['.eml','.msg.txt'].includes(ext)) deep=analyzeEml(buffer);
    else if(['.txt','.md','.csv','.json','.xml','.html','.js','.ts','.py','.java','.cs','.php','.go','.rb','.sql'].includes(ext) || (file.mimetype||'').startsWith('text/')){ const t=buffer.toString('utf8'); deep={engine:'text/code parser',metadata:{},provenance:{},structure:{lines:t.split(/\r?\n/).length},text:textStats(t),findings:[],limitations:['Text-only files normally carry little or no reliable authorship provenance.']}; }
    else if(magic(buffer)==='OLE Compound Binary') deep.limitations.push('Legacy Office binary format detected. Deep revision extraction is limited until the legacy OLE parser module is enabled.');
  }catch(e){ deep.findings.push({severity:'unknown',category:'parser',title:'Deep parser could not fully read this file',detail:e.message}); }
  const sevWeight={conflict:3,review:2,unknown:1,info:0};
  const risk=Math.min(100,deep.findings.reduce((n,f)=>n+(sevWeight[f.severity]||0)*12,0)+(deep.text?.aiStyleSignal?.score||0)*0.15);
  return {scanVersion:'0.2.0',scannedAt:new Date().toISOString(),file:base,...deep,summary:{riskScore:Math.round(risk),findingCount:deep.findings.length,verdict:deep.findings.some(f=>f.severity==='conflict')?'conflict':deep.findings.some(f=>f.severity==='review')?'review':deep.findings.length?'unknown':'confirmed'},disclaimer:'EMET ONE reports observable evidence and conflicts. It does not claim certainty where the file does not contain enough evidence.'};
}

function analyzeTextInput(text){ return {scanVersion:'0.2.0',scannedAt:new Date().toISOString(),engine:'text style and consistency analyzer',text:textStats(text),summary:{verdict:'style-only'},limitations:['Text alone cannot reliably prove whether a human or AI authored it.','For stronger verification, upload the original file so document metadata, revisions, relationships and package structure can also be inspected.']}; }

module.exports={analyzeFile,analyzeTextInput};
