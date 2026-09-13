'use strict';
const path=require('path');
const crypto=require('crypto');
const AdmZip=require('adm-zip');

const sha=(b,alg='sha256')=>crypto.createHash(alg).update(b).digest('hex');
const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const uniq=a=>[...new Set((a||[]).filter(Boolean))];
const textish=b=>Buffer.isBuffer(b)?b.toString('utf8'):String(b||'');

function parseJpeg(buffer){
  if(buffer.length<4||buffer[0]!==0xff||buffer[1]!==0xd8)return null;
  const segments=[];let i=2,sosEnd=null;
  while(i+3<buffer.length){if(buffer[i]!==0xff){i++;continue;}let marker=buffer[i+1];while(marker===0xff){i++;marker=buffer[i+1];}
    if(marker===0xd9){segments.push({marker:'EOI',offset:i,length:2});sosEnd=i+2;break;}
    if(marker===0xda){const len=buffer.readUInt16BE(i+2);segments.push({marker:'SOS',offset:i,length:len+2});let j=i+2+len;while(j+1<buffer.length){if(buffer[j]===0xff&&buffer[j+1]!==0x00&&buffer[j+1]!==0xff){i=j;break;}j++;}if(j+1>=buffer.length){sosEnd=buffer.length;break;}continue;}
    if([0x01,0xd0,0xd1,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7].includes(marker)){segments.push({marker:`0x${marker.toString(16)}`,offset:i,length:2});i+=2;continue;}
    const len=buffer.readUInt16BE(i+2);if(len<2||i+2+len>buffer.length)break;const data=buffer.subarray(i+4,i+2+len);let name=`0x${marker.toString(16)}`;
    if(marker>=0xe0&&marker<=0xef)name=`APP${marker-0xe0}`;else if(marker===0xdb)name='DQT';else if(marker===0xc0||marker===0xc2)name='SOF';else if(marker===0xfe)name='COM';
    segments.push({marker:name,offset:i,length:len+2,data});i+=2+len;
  }
  const apps=segments.filter(s=>/^APP/.test(s.marker));const labels=apps.map(s=>textish(s.data).slice(0,96));
  const dqt=segments.filter(s=>s.marker==='DQT').map(s=>sha(s.data,'sha1').slice(0,16));
  const combined=Buffer.concat(apps.map(s=>s.data||Buffer.alloc(0))).toString('latin1').toLowerCase();
  const generators=['adobe','photoshop','lightroom','openai','chatgpt','dall-e','midjourney','stable diffusion','comfyui','firefly','imagen','sora','runway'].filter(x=>combined.includes(x));
  const trailer=sosEnd&&sosEnd<buffer.length?buffer.length-sosEnd:0;
  return{format:'jpeg',segmentCount:segments.length,appSegments:apps.map(s=>s.marker),appLabels:labels.filter(Boolean),quantizationTableHashes:dqt,hasExif:labels.some(x=>x.startsWith('Exif')),hasXmp:labels.some(x=>/xmp|adobe:ns:meta/i.test(x)),hasPhotoshopApp13:segments.some(s=>s.marker==='APP13'),hasIcc:labels.some(x=>/ICC_PROFILE/i.test(x)),comments:segments.filter(s=>s.marker==='COM').map(s=>textish(s.data).slice(0,300)),generatorMarkers:generators,trailingBytesAfterEoi:trailer};
}

function parsePng(buffer){
  if(buffer.length<12||buffer.toString('hex',0,8)!=='89504e470d0a1a0a')return null;const chunks=[];let o=8;
  while(o+12<=buffer.length){const len=buffer.readUInt32BE(o),type=buffer.toString('ascii',o+4,o+8);if(o+12+len>buffer.length)break;const data=buffer.subarray(o+8,o+8+len);chunks.push({type,length:len,crc:buffer.readUInt32BE(o+8+len),data});o+=12+len;if(type==='IEND')break;}
  const textual=chunks.filter(c=>['tEXt','iTXt','zTXt'].includes(c.type)).map(c=>textish(c.data).slice(0,1000));const joined=textual.join('\n').toLowerCase();const generators=['adobe','photoshop','lightroom','openai','chatgpt','dall-e','midjourney','stable diffusion','comfyui','firefly','imagen','sora','runway'].filter(x=>joined.includes(x));
  return{format:'png',chunkTypes:chunks.map(c=>c.type),textChunks:textual,hasExif:chunks.some(c=>c.type==='eXIf'),hasIcc:chunks.some(c=>c.type==='iCCP'),hasTime:chunks.some(c=>c.type==='tIME'),hasPhysical:chunks.some(c=>c.type==='pHYs'),generatorMarkers:generators,trailingBytesAfterIend:o<buffer.length?buffer.length-o:0};
}

function xmlAttr(xml,name){const m=String(xml||'').match(new RegExp(`${name.replace(':','\\:')}="([^"]+)"`,'i'));return m?m[1]:null;}
function countRe(xml,re){return [...String(xml||'').matchAll(re)].length;}
function wordDeep(buffer){
  let zip;try{zip=new AdmZip(buffer);}catch{return null;}const entries=zip.getEntries(),names=entries.map(e=>e.entryName),get=n=>zip.getEntry(n)?.getData(),doc=textish(get('word/document.xml')),settings=textish(get('word/settings.xml')),core=textish(get('docProps/core.xml')),app=textish(get('docProps/app.xml')),custom=textish(get('docProps/custom.xml'));
  if(!doc)return null;
  const timestamps=entries.map(e=>e.header?.time?new Date(e.header.time).toISOString():null).filter(Boolean),timestampCounts={};for(const t of timestamps)timestampCounts[t]=(timestampCounts[t]||0)+1;
  const rsids=uniq([...doc.matchAll(/w:rsid(?:R|RPr|Del|P)="([0-9A-F]+)"/gi)].map(m=>m[1]));const settingsRsids=uniq([...settings.matchAll(/w:rsidRoot[^>]*w:val="([0-9A-F]+)"/gi),...settings.matchAll(/<w:rsid[^>]*w:val="([0-9A-F]+)"/gi)].map(m=>m[1]));
  const paraIds=uniq([...doc.matchAll(/w14:paraId="([0-9A-F]+)"/gi)].map(m=>m[1])),textIds=uniq([...doc.matchAll(/w14:textId="([0-9A-F]+)"/gi)].map(m=>m[1]));
  const revisions=[...doc.matchAll(/<w:(ins|del|moveFrom|moveTo)\b([^>]*)>/gi)].slice(0,500).map(m=>({type:m[1],author:xmlAttr(m[2],'w:author')||xmlAttr(m[2],'author'),date:xmlAttr(m[2],'w:date')||xmlAttr(m[2],'date'),id:xmlAttr(m[2],'w:id')||xmlAttr(m[2],'id')}));
  const rels=names.filter(n=>n.endsWith('.rels')).map(n=>textish(get(n))).join('\n'),externalTargets=[...rels.matchAll(/TargetMode="External"[^>]*Target="([^"]+)"/gi),...rels.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"/gi)].map(m=>m[1]);
  const comments=textish(get('word/comments.xml')),commentAuthors=uniq([...comments.matchAll(/w:author="([^"]+)"/gi)].map(m=>m[1]));
  const totalEditing=(app.match(/<TotalTime>(\d+)<\/TotalTime>/i)||[])[1]||null,appName=(app.match(/<Application>([^<]+)<\/Application>/i)||[])[1]||null,pages=(app.match(/<Pages>(\d+)<\/Pages>/i)||[])[1]||null,words=(app.match(/<Words>(\d+)<\/Words>/i)||[])[1]||null;
  const identicalTs=Math.max(0,...Object.values(timestampCounts)),identicalRatio=entries.length?identicalTs/entries.length:0;let anomaly=0,reasons=[];
  if(identicalRatio>.9){anomaly+=28;reasons.push('Most package parts share one identical ZIP timestamp.');}if(totalEditing==='0'&&Number(words)>800){anomaly+=22;reasons.push('Word reports zero editing time despite substantial content.');}if(rsids.length<=3&&Number(words)>1500){anomaly+=18;reasons.push('Very few revision-session identifiers for a long document.');}if(revisions.length===0&&Number(words)>3000){anomaly+=8;reasons.push('No tracked revisions are retained in a long document.');}if(pages==='1'&&Number(words)>1500){anomaly+=12;reasons.push('Application properties report one page despite a long document.');}
  return{kind:'docx_lineage',version:'EMET-DEEP-LINEAGE-2026.09.13',packageParts:entries.length,zipTimestampUnique:Object.keys(timestampCounts).length,dominantZipTimestampCount:identicalTs,dominantZipTimestampRatio:Number(identicalRatio.toFixed(3)),word:{application:appName,totalEditingMinutes:totalEditing==null?null:Number(totalEditing),pages:pages==null?null:Number(pages),words:words==null?null:Number(words),runSessionIds:rsids,settingsSessionIds:settingsRsids,paraIdCount:paraIds.length,textIdCount:textIds.length,trackedRevisions:revisions.length,revisionAuthors:uniq(revisions.map(r=>r.author)),revisionDates:uniq(revisions.map(r=>r.date)),commentAuthors,externalTargets:externalTargets.slice(0,50),customXmlParts:names.filter(n=>/^customXml\//i.test(n)).length,embeddedObjects:names.filter(n=>/word\/embeddings\//i.test(n)).length,embeddedMedia:names.filter(n=>/word\/media\//i.test(n)).length,macros:names.some(n=>/vbaProject\.bin$/i.test(n)),signatures:names.filter(n=>/_xmlsignatures|signatures/i.test(n)).length,documentVariables:countRe(settings,/<w:docVar\b/gi),removePersonalInformation:/<w:removePersonalInformation\b/i.test(settings),removeDateAndTime:/<w:removeDateAndTime\b/i.test(settings)},coreHash:core?sha(Buffer.from(core),'sha1').slice(0,16):null,customPropsPresent:Boolean(custom),lineageAnomalyScore:clamp(anomaly),lineageReasons:reasons};
}

function imageDeep(buffer){const jpg=parseJpeg(buffer),png=parsePng(buffer),container=jpg||png;if(!container)return null;let score=0,reasons=[];if(container.generatorMarkers?.length){score+=85;reasons.push(`Generator/editor markers: ${container.generatorMarkers.join(', ')}`);}if(container.trailingBytesAfterEoi>0||container.trailingBytesAfterIend>0){score+=10;reasons.push('Bytes remain after the logical end of the image container.');}if(container.hasPhotoshopApp13){score+=8;reasons.push('Photoshop APP13 metadata is present.');}return{kind:'image_container',version:'EMET-DEEP-CONTAINER-2026.09.13',container,containerSignalScore:clamp(score),reasons};}

function analyzeDeepContainer(file){const ext=path.extname(file.originalname||'').toLowerCase();if(['.jpg','.jpeg','.png'].includes(ext))return imageDeep(file.buffer)||{kind:'image_container',status:'unsupported_container'};if(['.docx','.docm'].includes(ext))return wordDeep(file.buffer)||{kind:'docx_lineage',status:'failed'};return{kind:'generic',status:'not_applicable'};}
module.exports={analyzeDeepContainer,parseJpeg,parsePng,wordDeep,imageDeep};
