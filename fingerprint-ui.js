(()=>{
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
