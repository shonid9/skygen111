'use strict';
const path=require('path');
const clamp=n=>Math.max(0,Math.min(100,Math.round(Number(n)||0)));
const uniq=a=>[...new Set((a||[]).filter(Boolean))];

function stage(id,title,status,score,evidence=[]){return{id,title,status,score:clamp(score),evidence:uniq(evidence)}}
function exactStage(gt){if(!gt?.matched)return null;const label=String(gt.label||'').toLowerCase();return stage('known_identity','Known ground truth','verified',100,[`Exact SHA-256 match to a labeled ${label||'known'} sample.`])}

function imageGraph(multimodal={},deep={},gt=null){
  const vf=multimodal.visionFusion||{},origin=vf.aiOriginEstimate||{},loc=vf.localization||{},container=deep?.container||{},markers=container.generatorMarkers||multimodal?.metadata?.generatorFingerprints||[],camera=origin.cameraEvidence||{},stages=[];
  const exact=exactStage(gt);if(exact)stages.push(exact);
  stages.push(stage('container','Container history',markers.length?'strong':'observed',markers.length?100:Math.min(65,(deep?.containerSignalScore||0)+20),[
    markers.length?`Generator/editor markers: ${markers.join(', ')}`:null,
    container.hasExif?'EXIF container data present.':null,
    container.hasXmp?'XMP metadata present.':null,
    container.hasPhotoshopApp13?'Photoshop APP13 block present.':null,
    container.trailingBytesAfterEoi>0||container.trailingBytesAfterIend>0?'Data exists after the logical image end marker.':null
  ]));
  stages.push(stage('capture','Capture pipeline',camera.score>=55?'camera_evidence':camera.score>0?'partial':'unknown',camera.score||0,[camera.make&&camera.model?`Camera metadata: ${camera.make} ${camera.model}`:null,camera.fieldsPresent?`${camera.fieldsPresent} capture fields retained.`:null]));
  const reg=Number(origin.regionStrength||0),boundary=Number(origin.boundaryAdhesion||0),edit=Math.round(reg*.55+boundary*.25+Number(multimodal?.recompression?.recompressionAnomalyScore||0)*.2);
  stages.push(stage('edit_localization','Local edit / synthetic localization',loc.regions?.length?'localized':'quiet',edit,[loc.regions?.length?`${loc.regions.length} spatial region(s) exceeded the local forensic threshold.`:null,Number(loc.coverage)>0?`${Math.round(Number(loc.coverage)*100)}% approximate highlighted coverage.`:null,boundary?`Boundary adhesion signal ${boundary}/100.`:null]));
  stages.push(stage('origin_fusion','Origin fusion',Number(origin.score)>=80?'strong':Number(origin.score)>=55?'elevated':'weak',origin.score||0,[`Independent evidence agreement ${origin.agreement||0}/100.`,...(origin.signals||[]).filter(s=>Number(s.score)>=55).slice(0,6).map(s=>`${String(s.id).replaceAll('_',' ')} ${Math.round(Number(s.score))}/100`)]));
  const verified=Boolean(gt?.matched)||markers.length>0&&Number(origin.score)>=98;
  const summary=verified?'Known or directly attributed source evidence is present.':loc.regions?.length?'A probable transformation path and localized forensic regions were reconstructed.':'A partial source path was reconstructed from retained container and pixel evidence.';
  return{version:'EMET-SOURCE-GRAPH-2026.09.13',kind:'image',verified,summary,originSignal:clamp(origin.score||0),stages,regions:(loc.regions||[]).slice(0,20),method:'container provenance + capture evidence + spatial forensics + origin fusion'};
}

function docGraph(aiAnalysis={},deep={},fingerprint={},gt=null){
  const a=aiAnalysis.assessment||{},p=a.process||{},m=a.authorshipMap||{},w=deep?.word||{},stages=[];
  const exact=exactStage(gt);if(exact)stages.push(exact);
  stages.push(stage('package','OOXML package lineage',Number(deep?.lineageAnomalyScore)>=70?'strong_assembly':Number(deep?.lineageAnomalyScore)>=35?'review':'ordinary',deep?.lineageAnomalyScore||0,[...(deep?.lineageReasons||[]),deep?.dominantZipTimestampRatio!=null?`${Math.round(Number(deep.dominantZipTimestampRatio)*100)}% of package parts share the dominant ZIP timestamp.`:null]));
  const sessionScore=Math.min(100,(Number(fingerprint?.runSessionTraceCoverage||0)*.55)+(Number(fingerprint?.uniqueRunSessions||0)>1?25:5)+(Number(w.trackedRevisions||0)>0?20:0));
  stages.push(stage('editing_sessions','Editing-session graph',Number(fingerprint?.runSessionTraceCoverage)>=35?'retained':'sparse',sessionScore,[fingerprint?.runs?`${fingerprint.runs} Word runs inspected.`:null,`${fingerprint?.uniqueRunSessions||0} distinct run/session identifiers retained.`,`${fingerprint?.candidateCount||0} local edit candidate(s) found.`,w.trackedRevisions?`${w.trackedRevisions} tracked revision event(s) retained.`:null]));
  stages.push(stage('authorship_regions','Authorship region map',m.supported?'mapped':'unavailable',m.documentSignalScore||m.estimatedAIShare||0,[m.supported?`${m.items?.length||0} paragraph region(s) mapped.`:null,m.supported?`${m.counts?.strongAI||0} strong AI-signal paragraph(s).`:null,m.supported?`${m.counts?.humanEditCandidates||0} human-edit candidate paragraph(s).`:null]));
  stages.push(stage('assembly','Creation / assembly process',p.status||'observed',p.score||0,(p.findings||[]).filter(x=>x.weight>0).slice(0,7).map(x=>x.meaning?.en||x.observed)));
  const verified=Boolean(gt?.matched)||a.ai?.status==='authenticated_source_claim';
  const summary=verified?'The file has an authenticated or exact known-source anchor.':fingerprint?.candidateCount?'The document lineage graph includes local edit candidates tied to Word run/session structure.':'The document lineage graph reconstructs package and editing history from the traces Word retained.';
  return{version:'EMET-SOURCE-GRAPH-2026.09.13',kind:'document',verified,summary,originSignal:clamp(m.documentSignalScore||m.estimatedAIShare||0),stages,editCandidates:(fingerprint?.candidates||[]).slice(0,40),method:'OOXML package lineage + run/session graph + paragraph authorship map + process forensics'};
}

function buildSourceGraph({file,aiAnalysis,multimodal,deepForensics,fingerprintLab,groundTruth}){
  const ext=path.extname(file?.originalname||'').toLowerCase();
  if(['.jpg','.jpeg','.png','.webp','.tif','.tiff'].includes(ext))return imageGraph(multimodal||{},deepForensics||{},groundTruth);
  if(['.docx','.docm'].includes(ext))return docGraph(aiAnalysis||{},deepForensics||{},fingerprintLab||{},groundTruth);
  return{version:'EMET-SOURCE-GRAPH-2026.09.13',kind:'generic',verified:false,summary:'No specialized lineage graph is available for this file type yet.',originSignal:0,stages:[]};
}
module.exports={buildSourceGraph,imageGraph,docGraph};
