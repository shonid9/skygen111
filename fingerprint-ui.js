(()=>{
  const style=document.createElement('style');style.textContent=`.fingerprintStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:15px}.fingerprintStats>div{padding:13px;border:1px solid var(--line);border-radius:13px;background:#fff}.fingerprintStats span{display:block;font:500 8px/1.3 "IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.07em;color:#7a746c}.fingerprintStats b{display:block;margin-top:7px;font-size:22px}.candidateList{display:grid;gap:9px;margin-top:14px}.candidate{padding:14px;border:1px solid var(--line);border-radius:15px;background:#fff;min-width:0}.candidateTop{display:flex;justify-content:space-between;gap:10px;align-items:center}.candidateTop span,.candidateTop b{font:500 8.5px/1.3 "IBM Plex Mono",monospace;text-transform:uppercase;letter-spacing:.05em}.candidateTop span{color:#777}.candidate mark{display:block;width:fit-content;max-width:100%;margin:12px 0 7px;padding:7px 9px;border-radius:8px;background:#e7ff76;color:#111;font-weight:750;font-size:16px;line-height:1.45;overflow-wrap:anywhere}.candidate small{display:block;color:#777;font:500 8.5px/1.5 "IBM Plex Mono",monospace;overflow-wrap:anywhere}.candidate p{margin:9px 0 0;color:#5f5a53;font-size:12px;line-height:1.5}.candidate details{margin-top:10px}.candidate summary{cursor:pointer;font-size:11px;font-weight:700}.candidate blockquote{margin:8px 0 0;padding:10px 12px;border-left:3px solid var(--blue);background:#f7f5f0;border-radius:8px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}.fingerprintCard{border-color:rgba(47,91,255,.22)}@media(max-width:680px){.fingerprintStats{grid-template-columns:1fr}.candidateTop{align-items:flex-start;flex-direction:column}.candidate mark{font-size:15px}.candidate{padding:12px}}`;document.head.appendChild(style);
  const originalFetch=window.fetch.bind(window);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalize(data){
    const local=data?.aiAnalysis?.local,ens=local?.ensemble;
    if(local&&ens){local.style=local.style||{};local.style.panels=local.style.panels||ens.panels||{};local.style.language=local.style.language||ens.language;local.style.promptResidue=local.style.promptResidue||local.manipulation?.promptResidue||[];}
    return data;
  }
  window.fetch=async(...args)=>{
    const res=await originalFetch(...args),u=String(args[0]?.url||args[0]||'');
    if(!/\/api\/(analyze|analyze-text)(?:$|\?)/.test(u))return res;
    try{
      const data=normalize(await res.clone().json());window.__EMET_LAST_SCAN=data;
      const headers=new Headers(res.headers);headers.set('content-type','application/json; charset=utf-8');
      return new Response(JSON.stringify(data),{status:res.status,statusText:res.statusText,headers});
    }catch{return res;}
  };
  function card(fp){
    if(!fp?.supported)return'';const cs=Array.isArray(fp.candidates)?fp.candidates:[],top=cs.slice(0,16);
    return `<div class="resultCard fingerprintCard" data-fingerprint-card="1"><div class="resultHead"><div><div class="eyebrow">WORD EDIT FINGERPRINT</div><h3>Local edit candidates</h3></div><span class="miniTag">${cs.length} candidate${cs.length===1?'':'s'}</span></div><p class="sectionLead">This layer maps the exact Word runs that look locally different from their surroundings. It uses editing-session IDs, tracked revisions, run boundaries, proofing and formatting fingerprints. A candidate is a place to inspect, not automatic proof of who typed it.</p><div class="fingerprintStats"><div><span>Run trace coverage</span><b>${esc(fp.runSessionTraceCoverage)}%</b></div><div><span>Word runs mapped</span><b>${esc(fp.runs)}</b></div><div><span>Baseline AI pattern</span><b>${esc(fp.baselineAIStyleScore)}/100</b></div></div>${top.length?`<div class="candidateList">${top.map((c,i)=>`<article class="candidate"><div class="candidateTop"><span>#${i+1} · paragraph ${Number(c.paragraphIndex)+1}</span><b>${esc(c.confidence)} · ${esc(c.score)}/100</b></div><mark dir="auto">${esc(c.text)}</mark><small>Unicode ${esc(c.startCodePoint)}–${esc(c.endCodePoint)}${c.paraId?` · paraId ${esc(c.paraId)}`:''}</small><p>${(c.evidence||[]).slice(0,3).map(esc).join(' ')}</p><details><summary>Show paragraph context</summary><blockquote dir="auto">${esc(c.context||'')}</blockquote></details></article>`).join('')}</div>`:`<div class="findingSimple ok" style="margin-top:14px"><b>No exact local edit candidate crossed the threshold</b><span>${esc(fp.interpretation||'The file may not retain enough run-level history for word attribution.')}</span></div>`}<details class="advanced"><summary>How exact is this?</summary><p class="sectionLead">${esc(fp.interpretation||'')}</p><p class="sectionLead">Locations are stored as Unicode code points plus DOCX paragraph and run positions, so Hebrew, ניקוד and emoji keep the correct location.</p></details></div>`;
  }
  function inject(){
    const data=window.__EMET_LAST_SCAN,fp=data?.aiAnalysis?.fingerprintLab,results=document.querySelector('#results');
    if(!results||!fp?.supported||results.querySelector('[data-fingerprint-card]'))return;
    const html=card(fp);if(!html)return;
    const cards=results.querySelectorAll(':scope > .resultCard');
    if(cards[2])cards[2].insertAdjacentHTML('afterend',html);else results.insertAdjacentHTML('beforeend',html);
  }
  const results=document.querySelector('#results');if(results)new MutationObserver(()=>setTimeout(inject,0)).observe(results,{childList:true,subtree:false});
})();
