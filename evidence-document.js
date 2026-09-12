'use strict';
const {DOMParser}=require('@xmldom/xmldom');
const path=require('node:path');
const {TextDecoder}=require('node:util');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const WS='http://purl.oclc.org/ooxml/wordprocessingml/main';
const CP='http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
const DC='http://purl.org/dc/elements/1.1/';
const DT='http://purl.org/dc/terms/';
const LIMITS={parts:2048,total:32*1024*1024,xml:8*1024*1024};
function invalid(message,statusCode=422){return Object.assign(new Error(message),{statusCode});}
function decodeXml(bytes) {
  if(typeof bytes==='string') return bytes;
  if(bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(2));
  if(bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be',{fatal:true}).decode(bytes.subarray(2));
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function parseXml(bytes) {
  const xml=decodeXml(bytes);
  if(Buffer.byteLength(xml)>LIMITS.xml)throw invalid('An XML part exceeds the inspection limit.',413);
  if(/<!DOCTYPE|<!ENTITY/iu.test(xml))throw invalid('DTD and custom XML entities are not permitted.');
  let problems=[];
  const doc=new DOMParser({onError:(level,message)=>{if(level!=='warning')problems.push(message);}}).parseFromString(xml,'application/xml');
  if(problems.length||!doc.documentElement)throw invalid('The document contains invalid XML.');
  return doc;
}
function isW(n,name){return n.nodeType===1&&(n.namespaceURI===W||n.namespaceURI===WS)&&n.localName===name;}
function walk(root,fn){const stack=[root];while(stack.length){const n=stack.pop();if(fn(n)===false)continue;for(let c=n.lastChild;c;c=c.previousSibling)stack.push(c);}}
function allW(doc,name){const found=[];walk(doc,n=>{if(isW(n,name))found.push(n)});return found;}
function metadataFromXml(coreXml){
  if(!coreXml)return{};
  const doc=parseXml(coreXml),out={};
  for(const [key,ns,name] of [['creator',DC,'creator'],['lastModifiedBy',CP,'lastModifiedBy'],['created',DT,'created'],['modified',DT,'modified'],['revision',CP,'revision'],['title',DC,'title']]) {
    const values=Array.from(doc.getElementsByTagNameNS(ns,name)).map(n=>n.textContent);
    if(values.length===1)out[key]=values[0];
    else if(values.length>1){out[key]=null;out[`${key}Ambiguous`]=true;}
  }
  return out;
}
function parseWordPart(xml,part='word/document.xml') {
  const doc=parseXml(xml),paragraphs=[],revisions=[],hidden=[];
  walk(doc,n=>{if(isW(n,'ins')||isW(n,'del')||isW(n,'moveFrom')||isW(n,'moveTo'))revisions.push({type:n.localName,author:n.getAttributeNS(n.namespaceURI,'author')||null,date:n.getAttributeNS(n.namespaceURI,'date')||null,part});});
  for(const p of allW(doc,'p')) {
    let text='';
    walk(p,n=>{
      if(n!==p&&isW(n,'p'))return false;
      if(isW(n,'del')||isW(n,'moveFrom'))return false;
      if(isW(n,'r')) {
        const hiddenProps=allW(n,'vanish').concat(allW(n,'webHidden'));
        if(hiddenProps.some(x=>!['0','false','off'].includes(x.getAttributeNS(x.namespaceURI,'val')))){hidden.push({part,text:n.textContent});return false;}
      }
      if(isW(n,'t')){text+=n.textContent;return false;}
      if(isW(n,'tab'))text+='\t';
      if(isW(n,'br')||isW(n,'cr'))text+='\n';
    });
    const id=p.getAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml','paraId')||null;
    paragraphs.push({part,partParagraphIndex:paragraphs.length,paraId:id,text});
  }
  return {paragraphs,revisions,hidden};
}
function canonicalDocument(parts) {
  let text='',paragraphs=[],revisions=[],hiddenTextCount=0;
  for(const [part,xml]of Object.entries(parts)) {
    const parsed=parseWordPart(xml,part);revisions.push(...parsed.revisions);hiddenTextCount+=parsed.hidden.length;
    for(const p of parsed.paragraphs){if(paragraphs.length)text+='\n\n';const start=text.length;text+=p.text;paragraphs.push({...p,index:paragraphs.length,startUTF16:start,endUTF16:text.length});}
  }
  return{text,paragraphs,revisions,hiddenTextCount};
}
function validateArchive(buffer){
  const AdmZip=require('adm-zip');
  const zip=new AdmZip(buffer),entries=zip.getEntries();
  if(entries.length>LIMITS.parts)throw invalid('The archive contains too many parts.',413);
  let total=0;const names=new Set();
  for(const e of entries){
    if(e.entryName.includes('..')||e.entryName.startsWith('/')||e.entryName.includes('\\')||names.has(e.entryName))throw invalid('The archive contains an unsafe or duplicate part name.');
    names.add(e.entryName);total+=Number(e.header.size)||0;
    if(total>LIMITS.total||(/\.xml$|\.rels$/i.test(e.entryName)&&e.header.size>LIMITS.xml))throw invalid('The expanded archive exceeds the inspection limit.',413);
    if(e.header.flags&1)throw invalid('The archive is encrypted.');
  }
  return zip;
}
function readDocx(file){
  if(!['.docx','.docm'].includes(path.extname(file.originalname||'').toLowerCase()))return null;
  const zip=validateArchive(file.buffer),parts={},names=zip.getEntries().map(e=>e.entryName);
  if(!zip.getEntry('word/document.xml'))throw invalid('The Word document body is missing.');
  const ordered=['word/document.xml',...names.filter(n=>/^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/i.test(n)).sort()];
  for(const n of ordered)parts[n]=zip.getEntry(n).getData();
  const out=canonicalDocument(parts);
  out.metadata=metadataFromXml(zip.getEntry('docProps/core.xml')?.getData());
  out.coverage={readParts:ordered,excludedParts:names.filter(n=>/comments.*\.xml|embeddings\//i.test(n)),embeddedImagesChecked:false,hiddenTextIncluded:false,deletedTextIncluded:false,scope:'Current text in body, tables, text boxes, headers, footers and footnotes. Comments, hidden and deleted text are excluded from authorship observations.'};
  return out;
}
function repairFilename(value){
  const s=String(value||'');if(!/[ÃÂ×ØÙ]/u.test(s)||Array.from(s).some(c=>c.charCodeAt(0)>255))return s;
  try{const fixed=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(s,'latin1'));return fixed.includes('\uFFFD')?s:fixed;}catch{return s;}
}
module.exports={parseXml,metadataFromXml,parseWordPart,canonicalDocument,readDocx,validateArchive,repairFilename,LIMITS};
