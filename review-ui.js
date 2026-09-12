(()=>{
  'use strict';
  const root=document.querySelector('#results');if(!root)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let preferred=null,scheduled=false;
  const dictionary={
    he:{eyebrow:'ממצאים מתוך הקובץ',language:'שפת הדוח',words:'מילים שנקראו',model:'מסווג מקור הכתיבה',modelState:'לא פעיל',edits:'שינויים שנשמרו',self:'הצהרה במסמך',quote:'קטע שנמצא',paragraph:'פסקה',checks:'מה נבדק בפועל',details:'מיקום מדויק במקור',facts:'נתונים שהקובץ מצהיר עליהם',note:'שמות ותאריכים בקובץ ניתנים לשינוי. הם אינם זהות או חותמת זמן מאומתות.',notProof:'הצהרה או ביטוי במסמך אינם מוכיחים מי כתב כל מילה.',noQuotes:'לא נמצאה הצהרת שימוש מפורשת או תבנית ביטוי נתמכת בבדיקות שבוצעו. אין בכך הוכחה לכתיבה אנושית.',legacy:'מדידות טכניות לא מכוילות',legacyNote:'המספרים הישנים הם מדדי כללים, לא אחוזי בינה מלאכותית ולא מדדי דיוק.',word_structure:'מבנה Word',stored_revisions:'שינויים מתועדים',text:'קריאת הטקסט',local_phrases:'בדיקת ביטויים והצהרות',ai_classifier:'מסווג AI מאומן',fact_verification:'אימות מול מקורות חיצוניים',pdf_text:'שכבת טקסט ב-PDF',completed:'בוצע',not_configured:'טרם הוגדר',not_checked:'לא נבדק',not_available:'לא זמין',not_applicable:'לא רלוונטי',created:'יצירה לפי הקובץ',modified:'שינוי לפי הקובץ',creator:'שם היוצר שנשמר',lastModifiedBy:'שם העורך האחרון שנשמר',revision:'מונה גרסה שנשמר',title:'כותרת שנשמרה',coverage:'כיסוי הטקסט שחולץ',unknown:'לא זמין',scope:'כיסוי זה מתייחס לטקסט שחולץ, לא לכל סוגי התוכן בקובץ.',provenance:'מצב אימות הצהרת המקור'},
    en:{eyebrow:'OBSERVED IN THIS FILE',language:'Report language',words:'Words read',model:'AI text classifier',modelState:'Not active',edits:'Stored changes',self:'Document statement',quote:'Located passage',paragraph:'Paragraph',checks:'What actually ran',details:'Exact source location',facts:'Properties declared by the file',note:'Stored names and dates can be changed. They are not authenticated identities or timestamps.',notProof:'A declaration or phrase does not prove who wrote each word.',noQuotes:'No supported explicit disclosure or assistant phrase was found by these checks. This is not evidence of human authorship.',legacy:'Uncalibrated technical measurements',legacyNote:'These legacy rule scores are not AI percentages or accuracy measurements.',word_structure:'Word structure',stored_revisions:'Stored revisions',text:'Text extraction',local_phrases:'Phrases and disclosures',ai_classifier:'Trained AI classifier',fact_verification:'External fact verification',pdf_text:'PDF text layer',completed:'Completed',not_configured:'Not configured',not_checked:'Not checked',not_available:'Unavailable',not_applicable:'Not applicable',created:'Declared creation',modified:'Declared modification',creator:'Stored creator name',lastModifiedBy:'Stored last editor',revision:'Stored revision count',title:'Stored title',coverage:'Extracted text coverage',unknown:'Not available',scope:'Coverage applies to extracted text, not every media layer in the file.',provenance:'Source-claim validation status'}
  };
  function draw(a){
    const lang=preferred||(a.language?.code==='he'?'he':'en'),t=dictionary[lang],meta=a.metadata||{};
    const observations=a.observations||[];
    return `<article class="reviewCard" data-review-card dir="${lang==='he'?'rtl':'ltr'}" lang="${lang}">
      <div class="reviewTop"><span class="reviewEyebrow">${t.eyebrow}</span><label>${t.language}<select data-report-lang aria-label="${t.language}"><option value="en"${lang==='en'?' selected':''}>English</option><option value="he"${lang==='he'?' selected':''}>עברית</option></select></label></div>
      <h2>${esc(a.title?.[lang]||a.title?.en)}</h2><p class="reviewLead">${esc(a.explanation?.[lang]||a.explanation?.en)}</p>
      <div class="reviewFacts"><div><span>${t.words}</span><strong>${Number(a.wordCount||0).toLocaleString()}</strong></div><div><span>${t.edits}</span><strong>${(a.revisions||[]).length}</strong></div><div><span>${t.model}</span><strong>${t.modelState}</strong></div></div>
      <details class="reviewChecks"><summary>${t.checks}</summary><dl>${(a.checks||[]).map(c=>`<div><dt>${esc(t[c.id]||c.id)}</dt><dd>${esc(t[c.status]||c.status)}</dd></div>`).join('')}<div><dt>${t.coverage}</dt><dd>${a.coverage?.fraction==null?t.unknown:Math.round(a.coverage.fraction*100)+'%'}</dd></div></dl><p>${t.scope}</p></details>
      <div class="reviewObservations">${observations.length?observations.map(f=>`<section class="reviewObservation"><div class="reviewObservationTitle"><b>${f.type==='ai_use_disclosure'?t.self:t.quote}</b><span>${t.paragraph} ${Number(f.locator?.paragraphIndex??0)+1}</span></div><blockquote dir="auto">${esc(f.quote)}</blockquote><p>${t.notProof}</p><details><summary>${t.details}</summary><code dir="ltr">${esc(f.locator?.part||'text')}<br>Code points ${f.locator?.startCodePoint} to ${f.locator?.endCodePoint}</code></details></section>`).join(''):`<p class="reviewQuiet">${t.noQuotes}</p>`}</div>
      ${Object.keys(meta).length?`<details class="reviewChecks"><summary>${t.facts}</summary><dl>${Object.entries(meta).filter(([,v])=>v!=null).map(([k,v])=>`<div><dt>${esc(t[k]||k)}</dt><dd dir="auto">${esc(v)}</dd></div>`).join('')}</dl><p>${t.note}</p></details>`:''}
      ${a.provenance?`<details class="reviewChecks"><summary>${t.provenance}</summary><p dir="ltr">${esc(a.provenance.status||'not_checked')}</p></details>`:''}
    </article>`;
  }
  function inject(){
    scheduled=false;
    const data=window.__EMET_LAST_SCAN,a=data?.aiAnalysis?.assessment;
    if(!a||root.querySelector('.emptyResult')||!root.querySelector('.compactCard')||root.querySelector('[data-review-card]'))return;
    const fragment=document.createElement('div');fragment.innerHTML=draw(a);root.prepend(fragment.firstElementChild);
    // Preserve old measurements for comparison, but stop presenting them as AI probability.
    const legacy=[...root.querySelectorAll(':scope > .resultCard')].filter(c=>c.classList.contains('verdictHero')||c.querySelector('.plainScores,.segmentMap,.timelineSimple'));
    if(legacy.length){
      const lang=preferred||(a.language?.code==='he'?'he':'en'),t=dictionary[lang],details=document.createElement('details');details.className='resultCard reviewLegacy';
      const summary=document.createElement('summary');summary.textContent=t.legacy;details.append(summary);
      const note=document.createElement('p');note.textContent=t.legacyNote;details.append(note);
      for(const node of legacy){if(node.classList.contains('verdictHero')){node.remove();continue;}details.append(node);}
      root.append(details);
    }
  }
  new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(inject)}}).observe(root,{childList:true});
  root.addEventListener('change',e=>{if(!e.target.matches('[data-report-lang]'))return;preferred=e.target.value;const a=window.__EMET_LAST_SCAN?.aiAnalysis?.assessment;if(a)root.querySelector('[data-review-card]').outerHTML=draw(a)});
  inject();
})();
