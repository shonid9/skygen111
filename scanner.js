(()=>{
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const fileInput=$('#fileInput'), drop=$('#dropzone'), fileBox=$('#selectedFile'), scanBtn=$('#scanBtn'), resetBtn=$('#resetBtn'), status=$('#scanStatus'), results=$('#results'), textBtn=$('#textScanBtn'), textArea=$('#textInput');
  const fmtBytes=n=>{if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB'};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeObj=o=>o&&typeof o==='object'?o:{};
  let chosen=null;
  function setFile(f){chosen=f||null;if(!chosen){fileBox?.classList.remove('show');if(fileBox)fileBox.innerHTML='';return;}fileBox.innerHTML=`<span>${esc(chosen.name)}</span><span>${fmtBytes(chosen.size)}</span>`;fileBox.classList.add('show')}
  fileInput?.addEventListener('change',e=>setFile(e.target.files?.[0]));
  ['dragenter','dragover'].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('drag')}));
  ['dragleave','drop'].forEach(ev=>drop?.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('drag')}));
  drop?.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f)setFile(f)});
  resetBtn?.addEventListener('click',()=>{chosen=null;if(fileInput)fileInput.value='';setFile(null);results.innerHTML=emptyHtml();status.classList.remove('show')});
  function emptyHtml(){return `<div class="emptyResult"><div><b>Nothing assumed.</b><span>Upload the original file. EMET ONE will inspect what is actually stored inside it.</span></div></div>`}
  function statusOn(msg){status.classList.add('show');status.querySelector('.scanLog').textContent=msg}
  function statusOff(){status.classList.remove('show')}
  function pill(v){return `<span class="verdictPill ${esc((v||'unknown').toLowerCase())}">${esc(v||'unknown')}</span>`}
  function rows(obj){obj=safeObj(obj);const entries=Object.entries(obj).filter(([,v])=>v!==null&&v!==undefined&&v!==''&&!(Array.isArray(v)&&!v.length)).slice(0,36);if(!entries.length)return '<p class="sectionLead" style="margin:10px 0 0">No readable fields in this layer.</p>';return `<dl class="kv">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(typeof v==='object'?JSON.stringify(v):v)}</dd></div>`).join('')}</dl>`}
  function findings(list){if(!Array.isArray(list)||!list.length)return `<div class="evidenceRow"><div class="top"><b>No contradiction signal found in the parsed layers</b><span class="sev info">INFO</span></div><p>This does not prove the file is genuine. It means this parser did not find a stored conflict in the evidence it could read.</p></div>`;return list.map(f=>`<div class="evidenceRow"><div class="top"><b>${esc(f.title)}</b><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span></div><p>${esc(f.detail)}</p></div>`).join('')}
  function providerRows(list){
    if(!Array.isArray(list)||!list.length)return `<div class="evidenceRow"><div class="top"><b>No external AI detector keys are connected yet</b><span class="sev info">LOCAL</span></div><p>C2PA and deep file forensics still run locally. External detectors are deliberately not simulated.</p></div>`;
    return list.map(p=>`<div class="evidenceRow"><div class="top"><b>${esc(p.provider||'Detector')}</b><span class="sev ${p.verdict==='AI'||p.verdict==='MIXED'?'review':p.verdict==='UNAVAILABLE'?'unknown':'info'}">${esc(p.verdict||'UNKNOWN')}</span></div><p>${esc(p.classification||p.confidence||p.error||'Provider returned a structured detection result.')}</p></div>`).join('');
  }
  function aiCard(d){
    const a=safeObj(d.aiAnalysis); if(!Object.keys(a).length)return '';
    const f=safeObj(a.final), prov=safeObj(a.provenance), c2=safeObj(prov.c2pa), local=safeObj(a.local), sty=safeObj(local.style), manip=safeObj(local.manipulation), ff=safeObj(local.fileForensics), coverage=safeObj(a.coverage);
    const segs=Array.isArray(a.segments?.local)?a.segments.local:[];
    const segHtml=segs.length?`<div class="evidenceRows">${segs.slice(0,12).map(x=>`<div class="evidenceRow"><div class="top"><b>Window ${Number(x.index)+1} · ${esc(x.words)} words</b><span class="sev ${Number(x.regularityScore)>=60?'review':'info'}">${esc(x.regularityScore)}/100</span></div><p>${esc(x.label)}${x.reasons?.length?' · '+esc(x.reasons.join('; ')):''}</p></div>`).join('')}</div>`:'';
    return `<div class="resultCard aiVerdictCard">
      <div class="resultHead"><div><div class="eyebrow">AI & PROVENANCE VERDICT</div><h3>${esc((f.verdict||'INCONCLUSIVE').replaceAll('_',' '))}</h3></div>${pill(f.confidence||'unknown')}</div>
      <p class="sectionLead" style="margin-top:8px">${esc(f.reason||'No conclusion available.')}</p>
      <div class="scoreStrip">
        <div class="scoreBox"><span>Evidence grade</span><b style="font-size:12px;line-height:1.2">${esc(f.evidenceGrade||'—')}</b></div>
        <div class="scoreBox"><span>Proven</span><b>${f.canProve?'YES':'NO'}</b></div>
        <div class="scoreBox"><span>Local regularity</span><b>${esc(sty.regularityScore??'—')}</b></div>
        <div class="scoreBox"><span>C2PA</span><b style="font-size:12px">${c2.manifestPresent?(c2.validationPassed?'VALID':'FOUND'):'NONE'}</b></div>
      </div>
      <div class="notice">EMET ONE only calls AI origin verified when a trustworthy provenance or watermark signal supports it. Statistical detectors are evidence, not proof.</div>
    </div>
    <div class="resultCard"><div class="resultHead"><h3>Independent detector consensus</h3><span class="mono" style="font-size:9px">NO FAKE CERTAINTY</span></div>${providerRows(a.providers)}</div>
    <div class="resultCard"><div class="resultHead"><h3>Cryptographic & source provenance</h3><span class="mono" style="font-size:9px">C2PA / PROVIDER SIGNALS</span></div>${rows({c2paManifest:c2.manifestPresent,c2paValid:c2.validationPassed,c2paAIDeclared:c2.aiDeclared,embedded:c2.embedded,claimGenerator:c2.claimGenerator,openAIProvenance:prov.openAI?.verdict||null,generatorFingerprints:ff.generatorFingerprints})}</div>
    <div class="resultCard"><div class="resultHead"><h3>Manipulation & evasion layer</h3><span class="mono" style="font-size:9px">UNICODE / HIDDEN ARTIFACTS</span></div>${rows({zeroWidth:manip.zeroWidth,bidiControls:manip.bidiControls,softHyphens:manip.softHyphens,mixedScriptTokens:manip.mixedScriptTokens,promptResidue:manip.promptResidue,hiddenTextProperties:ff.hiddenTextProperties,altChunkImports:ff.altChunkImports,incrementalPdfUpdate:ff.incrementalUpdateLikely})}</div>
    ${segHtml?`<div class="resultCard"><div class="resultHead"><h3>Segment analysis</h3><span class="mono" style="font-size:9px">SLIDING WINDOWS</span></div>${segHtml}</div>`:''}`;
  }
  function render(d){
    const f=safeObj(d.file), s=safeObj(d.summary), t=safeObj(d.text), a=safeObj(t.aiStyleSignal), rev=safeObj(d.revisions), st=safeObj(d.structure);
    results.innerHTML=`
      ${aiCard(d)}
      <div class="resultCard"><div class="resultHead"><div><div class="eyebrow">SCAN COMPLETE</div><h3>${esc(f.name||'Text sample')}</h3></div>${pill(s.verdict)}</div>
      <div class="scoreStrip">
        <div class="scoreBox"><span>Risk</span><b>${esc(s.riskScore??'—')}</b></div>
        <div class="scoreBox"><span>Findings</span><b>${esc(s.findingCount??0)}</b></div>
        <div class="scoreBox"><span>Legacy style</span><b>${esc(a.score??'—')}</b></div>
        <div class="scoreBox"><span>Engine</span><b style="font-size:13px;line-height:1.2">${esc(d.engine||'—')}</b></div>
      </div>
      ${f.sha256?`<div class="rawNote">SHA-256 ${esc(f.sha256)}<br>Magic: ${esc(f.magic)} · ${esc(fmtBytes(f.size||0))} · entropy ${esc(f.entropy)}</div>`:''}
      </div>
      <div class="resultCard"><div class="resultHead"><h3>Evidence signals</h3><span class="mono" style="font-size:9px">OBSERVED, NOT GUESSED</span></div><div class="evidenceRows">${findings(d.findings)}</div></div>
      <div class="resultCard"><div class="resultHead"><h3>Document provenance</h3><span class="mono" style="font-size:9px">WHO · WHEN · WITH WHAT</span></div>${rows(d.metadata)}${rows(d.provenance)}</div>
      ${d.revisions?`<div class="resultCard"><div class="resultHead"><h3>Revision layer</h3><span class="mono" style="font-size:9px">WORD / OOXML</span></div>${rows({trackedChanges:rev.trackedChangesEnabled,insertions:rev.insertions,deletions:rev.deletions,moves:(rev.moveFrom||0)+(rev.moveTo||0),rsidCount:rev.rsidCount,events:rev.events})}</div>`:''}
      <div class="resultCard"><div class="resultHead"><h3>Internal structure</h3><span class="mono" style="font-size:9px">PACKAGE CONTENTS</span></div>${rows(st)}</div>
      ${d.text?`<div class="resultCard"><div class="resultHead"><h3>Writing pattern</h3><span class="mono" style="font-size:9px">STYLE SIGNAL ONLY</span></div>${rows({words:t.words,sentences:t.sentences,paragraphs:t.paragraphs,averageSentenceWords:t.averageSentenceWords,sentenceBurstiness:t.sentenceBurstiness,uniqueWordRatio:t.uniqueWordRatio,'legacy AI-style score':a.score,'legacy AI-style label':a.label})}<div class="notice">${esc(a.note||'Writing style is not proof of authorship.')}</div></div>`:''}
      ${Array.isArray(d.limitations)&&d.limitations.length?`<div class="resultCard"><div class="resultHead"><h3>What this file cannot prove</h3></div><div class="evidenceRows">${d.limitations.map(x=>`<div class="evidenceRow"><p style="margin:0">${esc(x)}</p></div>`).join('')}</div></div>`:''}`;
    results.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function scanFile(){
    if(!chosen){drop?.classList.add('drag');setTimeout(()=>drop?.classList.remove('drag'),500);return;}
    statusOn('Hashing bytes · opening package · validating provenance · mapping revisions · comparing AI signals');scanBtn.disabled=true;
    try{const fd=new FormData();fd.append('file',chosen);const r=await fetch('/api/analyze',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Scan failed');render(d);localStorage.setItem('emet-one-demo-used','1');}
    catch(e){results.innerHTML=`<div class="resultCard"><div class="resultHead"><h3>Scan stopped</h3><span class="verdictPill conflict">error</span></div><p class="sectionLead">${esc(e.message)}</p></div>`}
    finally{scanBtn.disabled=false;statusOff()}
  }
  async function scanText(){
    const text=textArea?.value?.trim()||''; if(text.length<30){textArea?.focus();return;}
    statusOn('Segmenting text · checking manipulation · measuring stylometry · comparing available detectors');textBtn.disabled=true;
    try{const r=await fetch('/api/analyze-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Text scan failed');render(d);}
    catch(e){results.innerHTML=`<div class="resultCard"><h3>Text scan stopped</h3><p class="sectionLead">${esc(e.message)}</p></div>`}
    finally{textBtn.disabled=false;statusOff()}
  }
  scanBtn?.addEventListener('click',scanFile); textBtn?.addEventListener('click',scanText);
  results.innerHTML=emptyHtml();
})();
