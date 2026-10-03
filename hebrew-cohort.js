'use strict';
// Numeric inference for the private, reproducible Python-trained pilot.
// This classifies corpus membership; it never produces an AI authorship probability.
function detectorSamples(text, model) {
  const ws=String(text).match(/[\u05d0-\u05ea]+/g)||[];
  if(ws.length<500)return [];
  const lo=Math.min(100,Math.max(0,ws.length-model.window));
  const hi=Math.max(lo,Math.floor(ws.length*.8)-model.window);
  const starts=[...new Set([lo,Math.floor((lo+hi)/2),hi])].sort((a,b)=>a-b);
  return starts.map(s=>{
    const tokens=ws.slice(s,s+model.window), n=tokens.length, counts=new Map();
    for(const t of tokens)counts.set(t,(counts.get(t)||0)+1);
    const mean=tokens.reduce((a,w)=>a+w.length,0)/n;
    const std=Math.sqrt(tokens.reduce((a,w)=>a+(w.length-mean)**2,0)/n);
    let entropy=0,hapax=0;for(const v of counts.values()){entropy-=(v/n)*Math.log(v/n);if(v===1)hapax++;}
    const values=[mean,std/Math.max(mean,1),counts.size/n,entropy/Math.log(Math.max(n,2)),hapax/n];
    for(let k=1;k<=12;k++)values.push(tokens.filter(w=>w.length===k).length/n);
    for(const w of model.function_words)values.push((counts.get(w)||0)/n);
    for(const phrase of model.phrases){const parts=phrase.split(' ');let count=0;for(let i=0;i<=n-parts.length;i++)if(parts.every((p,j)=>tokens[i+j]===p))count++;values.push(count/n);}
    for(const prefix of model.prefixes)values.push(tokens.filter(w=>w.startsWith(prefix)&&w.length>1).length/n);
    return values;
  });
}
function validateDetectorModel(m){
  const n=m?.features?.length;
  if(m?.version!=='hebrew-cohort-logistic-v1'||n!==111||m.window!==350||!m.report?.training_performed||m.report.is_generic_ai_accuracy!==false)throw new Error('corpus_invalid_model');
  for(const key of ['mean','scale','coefficients'])if(!Array.isArray(m[key])||m[key].length!==n||m[key].some(x=>!Number.isFinite(x)))throw new Error('corpus_invalid_model');
  if(m.scale.some(x=>x<=0)||!Number.isFinite(m.intercept)||!Number.isFinite(m.threshold)||m.threshold<=0||m.threshold>=1)throw new Error('corpus_invalid_model');
  if(!Array.isArray(m.function_words)||!Array.isArray(m.phrases)||!Array.isArray(m.prefixes)||17+m.function_words.length+m.phrases.length+m.prefixes.length!==n)throw new Error('corpus_invalid_model');
  if([...m.function_words,...m.phrases,...m.prefixes].some(x=>typeof x!=='string'||x.length>80))throw new Error('corpus_invalid_model');
  if(!Array.isArray(m.train_source_ids)||m.train_source_ids.some(x=>typeof x!=='string'||x.length!==36))throw new Error('corpus_invalid_model');
  return m;
}
function scoreDetector(text,model,sourceId=null){
  validateDetectorModel(model);const samples=detectorSamples(text,model);
  if(!samples.length)return {status:'insufficient_text',minimum_hebrew_words:500,ai_probability:null};
  const x=model.mean.map((_,k)=>samples.reduce((a,s)=>a+s[k],0)/samples.length);
  const contributions=x.map((v,i)=>({feature:model.features[i],contribution:(v-model.mean[i])/model.scale[i]*model.coefficients[i]}));
  const logit=model.intercept+contributions.reduce((a,c)=>a+c.contribution,0);
  const score=logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit));
  return {status:'scored',version:model.version,cohort_score:score,threshold:model.threshold,reference_like:score>=model.threshold,ai_probability:null,seen_in_training:sourceId?model.train_source_ids.includes(sourceId):null,sampled_windows:samples.length,sampled_hebrew_tokens:samples.length*model.window,contributions:contributions.sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution)).slice(0,8),notice:'מדד הבחנה בין קבוצות הניסוי; אינו הסתברות למחבר AI. זיהוי כללי לא אומת.'};
}

module.exports={detectorSamples,validateDetectorModel,scoreDetector};
