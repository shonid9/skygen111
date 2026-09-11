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
  function pill(v){return `<span class="verdictPill ${esc(v||'unknown')}">${esc(v||'unknown')}</span>`}
  function rows(obj){obj=safeObj(obj);const entries=Object.entries(obj).filter(([,v])=>v!==null&&v!==undefined&&v!==''&&!(Array.isArray(v)&&!v.length)).slice(0,36);if(!entries.length)return '<p class="sectionLead" style="margin:10px 0 0">No readable fields in this layer.</p>';return `<dl class="kv">${entries.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(typeof v==='object'?JSON.stringify(v):v)}</dd></div>`).join('')}</dl>`}
  function findings(list){if(!Array.isArray(list)||!list.length)return `<div class="evidenceRow"><div class="top"><b>No contradiction signal found in the parsed layers</b><span class="sev info">INFO</span></div><p>This does not prove the file is genuine. It means this parser did not find a stored conflict in the evidence it could read.</p></div>`;return list.map(f=>`<div class="evidenceRow"><div class="top"><b>${esc(f.title)}</b><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span></div><p>${esc(f.detail)}</p></div>`).join('')}
  function render(d){
    const f=safeObj(d.file), s=safeObj(d.summary), t=safeObj(d.text), a=safeObj(t.aiStyleSignal), rev=safeObj(d.revisions), st=safeObj(d.structure);
    results.innerHTML=`
      <div class="resultCard"><div class="resultHead"><div><div class="eyebrow">SCAN COMPLETE</div><h3>${esc(f.name||'Text sample')}</h3></div>${pill(s.verdict)}</div>
      <div class="scoreStrip">
        <div class="scoreBox"><span>Risk</span><b>${esc(s.riskScore??'—')}</b></div>
        <div class="scoreBox"><span>Findings</span><b>${esc(s.findingCount??0)}</b></div>
        <div class="scoreBox"><span>AI style</span><b>${esc(a.score??'—')}</b></div>
        <div class="scoreBox"><span>Engine</span><b style="font-size:13px;line-height:1.2">${esc(d.engine||'—')}</b></div>
      </div>
      ${f.sha256?`<div class="rawNote">SHA-256 ${esc(f.sha256)}<br>Magic: ${esc(f.magic)} · ${esc(fmtBytes(f.size||0))} · entropy ${esc(f.entropy)}</div>`:''}
      </div>
      <div class="resultCard"><div class="resultHead"><h3>Evidence signals</h3><span class="mono" style="font-size:9px">OBSERVED, NOT GUESSED</span></div><div class="evidenceRows">${findings(d.findings)}</div></div>
      <div class="resultCard"><div class="resultHead"><h3>Document provenance</h3><span class="mono" style="font-size:9px">WHO · WHEN · WITH WHAT</span></div>${rows(d.metadata)}${rows(d.provenance)}</div>
      ${d.revisions?`<div class="resultCard"><div class="resultHead"><h3>Revision layer</h3><span class="mono" style="font-size:9px">WORD / OOXML</span></div>${rows({trackedChanges:rev.trackedChangesEnabled,insertions:rev.insertions,deletions:rev.deletions,moves:(rev.moveFrom||0)+(rev.moveTo||0),rsidCount:rev.rsidCount,events:rev.events})}</div>`:''}
      <div class="resultCard"><div class="resultHead"><h3>Internal structure</h3><span class="mono" style="font-size:9px">PACKAGE CONTENTS</span></div>${rows(st)}</div>
      ${d.text?`<div class="resultCard"><div class="resultHead"><h3>Writing pattern</h3><span class="mono" style="font-size:9px">STYLE SIGNAL ONLY</span></div>${rows({words:t.words,sentences:t.sentences,paragraphs:t.paragraphs,averageSentenceWords:t.averageSentenceWords,sentenceBurstiness:t.sentenceBurstiness,uniqueWordRatio:t.uniqueWordRatio,'AI-style score':a.score,'AI-style label':a.label})}<div class="notice">${esc(a.note||'Writing style is not proof of authorship.')}</div></div>`:''}
      ${Array.isArray(d.limitations)&&d.limitations.length?`<div class="resultCard"><div class="resultHead"><h3>What this file cannot prove</h3></div><div class="evidenceRows">${d.limitations.map(x=>`<div class="evidenceRow"><p style="margin:0">${esc(x)}</p></div>`).join('')}</div></div>`:''}`;
    results.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function scanFile(){
    if(!chosen){drop?.classList.add('drag');setTimeout(()=>drop?.classList.remove('drag'),500);return;}
    statusOn('Opening container · hashing bytes · reading metadata · mapping revisions');scanBtn.disabled=true;
    try{const fd=new FormData();fd.append('file',chosen);const r=await fetch('/api/analyze',{method:'POST',body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||'Scan failed');render(d);localStorage.setItem('emet-one-demo-used','1');}
    catch(e){results.innerHTML=`<div class="resultCard"><div class="resultHead"><h3>Scan stopped</h3><span class="verdictPill conflict">error</span></div><p class="sectionLead">${esc(e.message)}</p></div>`}
    finally{scanBtn.disabled=false;statusOff()}
  }
  async function scanText(){
    const text=textArea?.value?.trim()||''; if(text.length<30){textArea?.focus();return;}
    statusOn('Reading sentence rhythm · lexical diversity · structural regularity');textBtn.disabled=true;
    try{const r=await fetch('/api/analyze-text',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Text scan failed');render(d);}
    catch(e){results.innerHTML=`<div class="resultCard"><h3>Text scan stopped</h3><p class="sectionLead">${esc(e.message)}</p></div>`}
    finally{textBtn.disabled=false;statusOff()}
  }
  scanBtn?.addEventListener('click',scanFile); textBtn?.addEventListener('click',scanText);
  results.innerHTML=emptyHtml();
})();