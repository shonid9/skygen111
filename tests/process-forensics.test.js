'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const AdmZip=require('adm-zip');
const {inspectDocumentProcess}=require('../document-process');
function add(zip,name,text,date){zip.addFile(name,Buffer.from(text));const e=zip.getEntry(name);if(date)e.header.time=date;}
function fixture({synthetic=true}={}){
  const zip=new AdmZip(),epoch=new Date(1980,0,1,0,0,0),now=new Date(2026,8,12,12,0,0);
  const d=i=>synthetic?epoch:new Date(now.getTime()+i*60000);
  const created=synthetic?'2026-09-07T18:04:00Z':'2026-08-01T10:00:00Z',modified=synthetic?created:'2026-09-07T18:04:00Z';
  add(zip,'docProps/core.xml',`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dcterms="http://purl.org/dc/terms/"><cp:revision>${synthetic?1:12}</cp:revision><dcterms:created>${created}</dcterms:created><dcterms:modified>${modified}</dcterms:modified></cp:coreProperties>`,d(0));
  add(zip,'docProps/app.xml',`<Properties><TotalTime>${synthetic?0:240}</TotalTime><Pages>${synthetic?1:24}</Pages><Words>5000</Words><Application>Microsoft Office Word</Application></Properties>`,d(1));
  const declared=Array.from({length:synthetic?10:5},(_,i)=>`<w:rsid w:val="0000000${i}"/>`).join('');
  add(zip,'word/settings.xml',`<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${declared}</w:settings>`,d(2));
  const used=synthetic?'<w:p w:rsidR="00000001"><w:r><w:t>text</w:t></w:r></w:p>':Array.from({length:5},(_,i)=>`<w:p w:rsidR="0000000${i}"><w:r><w:t>text</w:t></w:r></w:p>`).join('');
  add(zip,'word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${used}<w:r><w:instrText>TOC</w:instrText></w:r></w:body></w:document>`,d(3));
  add(zip,'[Content_Types].xml','<Types/>',d(4));add(zip,'_rels/.rels','<Relationships/>',d(5));add(zip,'word/styles.xml','<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',d(6));add(zip,'word/fontTable.xml','<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',d(7));
  return {originalname:'sample.docx',buffer:zip.toBuffer()};
}
test('deterministic one-shot DOCX packaging is surfaced as strong process evidence',()=>{
  const file=fixture({synthetic:true}),doc={text:'מילה '.repeat(5200)};
  const r=inspectDocumentProcess(file,doc);
  assert.equal(r.status,'strong_assembly_signal');
  assert.ok(r.score>=70);
  assert.equal(r.metrics.allZipTimesDosEpoch,true);
  assert.equal(r.metrics.trackedRevisionMarkers,0);
  assert.ok(r.findings.some(f=>f.id==='zero_editing_time'));
  assert.ok(r.findings.some(f=>f.id==='stale_pagination'));
});
test('normal multi-session metadata is not promoted to strong assembly evidence',()=>{
  const file=fixture({synthetic:false}),doc={text:'מילה '.repeat(5200)};
  const r=inspectDocumentProcess(file,doc);
  assert.notEqual(r.status,'strong_assembly_signal');
  assert.ok(r.score<40);
});
test('Word field instrText is never mistaken for a tracked insertion',()=>{
  const file=fixture({synthetic:true}),doc={text:'מילה '.repeat(5200)};
  const r=inspectDocumentProcess(file,doc);
  assert.equal(r.metrics.trackedRevisionMarkers,0);
});
