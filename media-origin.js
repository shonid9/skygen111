'use strict';
const clamp=(n,a=1,b=99)=>Math.max(a,Math.min(b,Math.round(Number(n)||0)));
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const text=v=>JSON.stringify(v||{}).toLowerCase();
function confidence(layers,strong){const n=layers.filter(x=>x.available).length;if(strong)return n>=4?'high':'medium-high';if(n>=5)return'medium';if(n>=3)return'low-medium';return'low'}
function add(layers,id,score,weight,available=true,detail=''){layers.push({id,score:clamp(score),weight,available:Boolean(available),detail})}
function weighted(layers,prior=38){const active=layers.filter(x=>x.available&&x.weight>0);if(!active.length)return clamp(prior);let sw=0,s=0;for(const x of active){sw+=x.weight;s+=x.score*x.weight}const evidence=sw? s/sw:prior;const blend=Math.min(.88,.28+sw/12);return clamp(prior*(1-blend)+evidence*blend)}
function imageScore(m){const l=[],meta=m.metadata||{},px=m.pixelForensics||{},ela=m.recompression||{},copy=m.copyMove||{},old=m.syntheticImageSignal||{};
  const gens=Array.isArray(meta.generatorFingerprints)?meta.generatorFingerprints:[];
  add(l,'generator_metadata',gens.length?99:18,3,true,gens.length?gens.join(', '):'No known generator name in exposed metadata');
  add(l,'existing_local_forensics',Math.max(8,num(old.score)),2,true,'Existing EMET pixel/metadata forensic fusion');
  add(l,'noise_residual',px.noiseResidual<1.8&&px.edgeEnergy>8?78:px.noiseResidual<3?58:34,1.2,px.noiseResidual!=null,`noise ${px.noiseResidual??'n/a'} edge ${px.edgeEnergy??'n/a'}`);
  add(l,'entropy_texture',px.entropy>7.7?42:px.entropy<5.2?63:48,.7,px.entropy!=null,`entropy ${px.entropy??'n/a'}`);
  add(l,'jpeg_recompression',ela.supported?Math.max(15,num(ela.recompressionAnomalyScore)):45,.8,Boolean(ela.supported),ela.supported?`recompression ${ela.recompressionAnomalyScore}`:'not JPEG');
  add(l,'copy_move',copy.copyMoveSignal>=70?68:copy.copyMoveSignal>=35?53:35,.7,copy.copyMoveSignal!=null,`copy-move ${copy.copyMoveSignal??'n/a'}`);
  const software=String(meta.software||'').toLowerCase(); const cameraish=/iphone|samsung|pixel|canon|nikon|sony|fujifilm|olympus|panasonic|leica|huawei|xiaomi/.test(text(meta));
  add(l,'capture_pipeline',cameraish?18:/photoshop|lightroom|gimp|affinity/.test(software)?41:48,1,true,cameraish?'Camera/device metadata present':software?`Software: ${software}`:'No camera/device clue exposed');
  const score=weighted(l,42); const strong=gens.length>0||num(old.score)>=65;
  return{score,confidence:confidence(l,strong),layers:l,label:score>=75?'high_ai_likelihood':score>=55?'elevated_ai_likelihood':score>=35?'mixed_evidence':'low_ai_likelihood',calibrated:false};
}
function audioScore(m){const l=[],w=m.waveform||{},tags=m.container?.tags||{},s=text({tags,streams:m.streams});
  add(l,'generator_metadata',/openai|elevenlabs|suno|udio|descript|adobe|synthetic|tts|voice clone/.test(s)?94:35,2,true,'Container and stream metadata scan');
  add(l,'waveform_repetition',num(w.identicalSecondBlocks)>1?72:num(w.identicalSecondBlocks)===1?55:38,1.2,Boolean(w.available),`identical second blocks ${w.identicalSecondBlocks??'n/a'}`);
  add(l,'clipping_profile',num(w.clippedPct)===0?48:num(w.clippedPct)<.01?43:35,.5,Boolean(w.available),`clipped ${w.clippedPct??'n/a'}%`);
  add(l,'dc_profile',Math.abs(num(w.dcOffset))<.00005?52:39,.5,Boolean(w.available),`DC ${w.dcOffset??'n/a'}`);
  return{score:weighted(l,40),confidence:confidence(l,false),layers:l,label:'audio_ai_origin_estimate',calibrated:false};
}
function videoScore(m){const l=[],f=m.frameSampling||{},frames=Array.isArray(f.frames)?f.frames:[],s=text({container:m.container,streams:m.streams});
  add(l,'generator_metadata',/openai|sora|veo|runway|pika|luma|kling|synthetic|ai generated/.test(s)?96:36,2,true,'Container and stream metadata scan');
  add(l,'temporal_noise_consistency',f.noiseRange!=null?(f.noiseRange<.35?67:f.noiseRange<1?53:38):45,1.1,f.noiseRange!=null,`noise range ${f.noiseRange??'n/a'}`);
  add(l,'temporal_edge_consistency',f.edgeRange!=null?(f.edgeRange<.8?61:f.edgeRange<2?50:38):45,.8,f.edgeRange!=null,`edge range ${f.edgeRange??'n/a'}`);
  add(l,'sampling_coverage',frames.length>=5?50:42,.3,frames.length>0,`${frames.length} frames sampled`);
  return{score:weighted(l,41),confidence:confidence(l,false),layers:l,label:'video_ai_origin_estimate',calibrated:false};
}
function pdfScore(m,ai){const l=[],p=m.pdf||{},r=m.receipt||{},a=ai?.assessment||{};
  add(l,'document_ai_text',num(a.authorshipMap?.documentSignalScore)||num(ai?.local?.ensemble?.localScore)||38,1.6,Boolean(a.authorshipMap?.supported||ai?.local?.ensemble),'Extracted text origin signal');
  add(l,'incremental_structure',p.qpdfOk?40:58,.6,true,p.qpdfOk?'qpdf structure valid':'qpdf reported structural issue');
  add(l,'ocr_only',p.ocrFallbackPages>0&&p.digitalTextCharacters<120?46:38,.4,true,'OCR/digital text composition');
  add(l,'receipt_consistency',r.likelyReceipt&&r.arithmetic&&!r.arithmetic.consistent?58:42,.5,Boolean(r.likelyReceipt),'Receipt arithmetic if applicable');
  return{score:weighted(l,39),confidence:confidence(l,false),layers:l,label:'pdf_ai_origin_estimate',calibrated:false};
}
function officeScore(m,ai){const imgs=Array.isArray(m.images)?m.images:[],scores=imgs.map(x=>num(x.syntheticImageSignal?.score)).filter(x=>x>=0),l=[];const a=ai?.assessment||{};
  add(l,'document_text',num(a.authorshipMap?.documentSignalScore)||num(ai?.local?.ensemble?.localScore)||38,2,Boolean(a.authorshipMap?.supported||ai?.local?.ensemble),'Document text origin evidence');
  add(l,'embedded_media',scores.length?Math.max(...scores):38,1,scores.length>0,`${scores.length} embedded images checked`);
  add(l,'file_process',num(a.process?.score)||38,1,Boolean(a.process),'OOXML process fingerprint');
  return{score:weighted(l,40),confidence:confidence(l,false),layers:l,label:'office_ai_origin_estimate',calibrated:false};
}
function scoreMediaOrigin(multimodal,aiAnalysis,groundTruth){if(groundTruth?.matched){const ai=['ai','ai_edited'].includes(groundTruth.label);return{score:ai?100:0,confidence:'verified',label:ai?'known_ai_ground_truth':'known_human_ground_truth',calibrated:true,exactGroundTruth:true,layers:[{id:'exact_sha256_ground_truth',score:ai?100:0,weight:100,available:true,detail:'Exact labeled file match'}]}}
  const k=multimodal?.kind;let out=k==='image'?imageScore(multimodal):k==='audio'?audioScore(multimodal):k==='video'?videoScore(multimodal):k==='pdf'?pdfScore(multimodal,aiAnalysis):k==='office-embedded-media'?officeScore(multimodal,aiAnalysis):officeScore(multimodal||{},aiAnalysis);
  out.score=Math.max(1,Math.min(99,Math.round(out.score)));out.version='EMET-MEDIA-ORIGIN-ENSEMBLE-2026.09.13';out.note='Always-on local ensemble estimate. A percentage is returned for usability; confidence and evidence layers must be read with it. Only exact ground truth or authenticated provenance can make the result verified.';return out;
}
module.exports={scoreMediaOrigin};