(()=>{
  'use strict';
  const root=document.querySelector('#results');if(!root)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let preferred=null,scheduled=false;
  const dictionary={
    he:{eyebrow:'ממצאים מתוך הקובץ',language:'שפת הדוח',words:'מילים שנקראו',model:'מקור הכתיבה',modelState:'לא מאומת',edits:'שינויים שנשמרו',self:'הצהרה במסמך',quote:'קטע שנמצא',paragraph:'פסקה',checks:'מה נבדק בפועל',details:'מיקום מדויק במקור',facts:'נתונים שהקובץ מצהיר עליהם',note:'שמות ותאריכים בקובץ ניתנים לשינוי. הם אינם זהות או חותמת זמן מאומתות.',notProof:'הצהרה או ביטוי במסמך אינם מוכיחים מי כתב כל מילה.',noQuotes:'לא נמצאה הצהרת שימוש מפורשת או תבנית ביטוי נתמכת בבדיקות שבוצעו. אין בכך הוכחה לכתיבה אנושית.',legacy:'מדידות טכניות לא מכוילות',legacyNote:'המספרים הישנים הם מדדי כללים, לא אחוזי בינה מלאכותית ולא מדדי דיוק.',word_structure:'מבנה Word',stored_revisions:'שינויים מתועדים',file_process:'תהליך יצירה ואריזה',ai_origin_map:'מפת מקור כתיבה',text:'קריאת הטקסט',local_phrases:'בדיקת ביטויים והצהרות',ai_classifier:'מסווג AI מאומן',fact_verification:'אימות מול מקורות חיצוניים',pdf_text:'שכבת טקסט ב-PDF',completed:'בוצע',not_configured:'טרם הוגדר',not_checked:'לא נבדק',not_available:'לא זמין',not_applicable:'לא רלוונטי',created:'יצירה לפי הקובץ',modified:'שינוי לפי הקובץ',creator:'שם היוצר שנשמר',lastModifiedBy:'שם העורך האחרון שנשמר',revision:'מונה גרסה שנשמר',title:'כותרת שנשמרה',coverage:'כיסוי הטקסט שחולץ',unknown:'לא זמין',scope:'כיסוי זה מתייחס לטקסט שחולץ, לא לכל סוגי התוכן בקובץ.',provenance:'מצב אימות הצהרת המקור',processTitle:'עקבות יצירת הקובץ',processScore:'עוצמת חריגת התהליך',processWhy:'למה זה סומן',processLimit:'הציון מתאר את תהליך יצירת הקובץ, לא את זהות המחבר. ייצוא, המרה או תיקון מסמך יכולים ליצור חלק מהעקבות.',originTitle:'מפת מדדים לפי פסקאות',originLead:'מפת הפסקאות משלבת מדדי ניסוח ועקבות קובץ אחרי הפרדת כותרות ומקורות. אלה מדדים לא מכוילים; הצבעים אינם קובעים מי כתב את הפסקה.',aiShare:'חלק מהטקסט עם מדדים מוגברים; אינו שיעור AI',strongAI:'מדדים גבוהים',likelyAI:'מדדים מוגברים',humanEdit:'מועמד לעריכה אנושית',mixed:'מעורב / לא ברור',lowAI:'אות AI חלש',showAll:'הצג את כל הפסקאות',originScore:'ציון אות מקור'},
    en:{eyebrow:'OBSERVED IN THIS FILE',language:'Report language',words:'Words read',model:'Authorship source',modelState:'Not verified',edits:'Stored changes',self:'Document statement',quote:'Located passage',paragraph:'Paragraph',checks:'What actually ran',details:'Exact source location',facts:'Properties declared by the file',note:'Stored names and dates can be changed. They are not authenticated identities or timestamps.',notProof:'A declaration or phrase does not prove who wrote each word.',noQuotes:'No supported explicit disclosure or assistant phrase was found by these checks. This is not evidence of human authorship.',legacy:'Uncalibrated technical measurements',legacyNote:'These legacy rule scores are not AI percentages or accuracy measurements.',word_structure:'Word structure',stored_revisions:'Stored revisions',file_process:'Creation and packaging process',ai_origin_map:'AI origin map',text:'Text extraction',local_phrases:'Phrases and disclosures',ai_classifier:'Trained AI classifier',fact_verification:'External fact verification',pdf_text:'PDF text layer',completed:'Completed',not_configured:'Not configured',not_checked:'Not checked',not_available:'Unavailable',not_applicable:'Not applicable',created:'Declared creation',modified:'Declared modification',creator:'Stored creator name',lastModifiedBy:'Stored last editor',revision:'Stored revision count',title:'Stored title',coverage:'Extracted text coverage',unknown:'Not available',scope:'Coverage applies to extracted text, not every media layer in the file.',provenance:'Source-claim validation status',processTitle:'File creation trace',processScore:'Process anomaly strength',processWhy:'Why this was flagged',processLimit:'This score describes the file creation process, not the author. Export, conversion or repair can create some of the same traces.',originTitle:'Paragraph diagnostic map',originLead:'Paragraph diagnostics combine prose measurements and file traces after separating headings and references. These are uncalibrated measurements; colors do not determine paragraph authorship.',aiShare:'Text with elevated diagnostics; not AI share',strongAI:'High diagnostics',likelyAI:'Elevated diagnostics',humanEdit:'Human edit candidate',mixed:'Mixed / uncertain',lowAI:'Low AI signal',showAll:'Show all paragraphs',originScore:'Origin signal score'}
  };
  function modelValue(a,lang,t){
    if(a.ai?.status==='authenticated_source_claim')return lang==='he'?'הצהרת מקור חתומה':'Signed source claim';
    if(a.ai?.status==='self_reported')return lang==='he'?'הצהרה במסמך':'Document statement';
    return t.modelState;
  }
  function processBlock(a,lang,t){
    const p=a.process;if(!p)return'';
    const items=(p.findings||[]).filter(x=>x.weight>0).slice(0,8);
    const level=p.status==='strong_assembly_signal'?'strong':p.status==='assembly_review'?'review':'quiet';
    return `<section class="reviewProcess ${level}"><div class="reviewProcessHead"><div><span>${t.processTitle}</span><strong>${esc(p.title?.[lang]||p.title?.en||p.status)}</strong></div><b>${esc(p.score)}/100</b></div><p>${esc(p.explanation?.[lang]||p.explanation?.en||'')}</p>${items.length?`<div class="processFindings">${items.map(f=>`<article><span>${esc(f.severity||'observed')}</span><b dir="auto">${esc(f.observed??'')}</b><p>${esc(f.meaning?.[lang]||f.meaning?.en||'')}</p></article>`).join('')}</div>`:''}<small>${t.processLimit}</small></section>`;
  }
  function originBlock(a,lang,t){
    const m=a.authorshipMap;if(!m?.supported)return'';
    const labels={strong_ai_signal:t.strongAI,likely_ai:t.likelyAI,human_edit_candidate:t.humanEdit,mixed_or_uncertain:t.mixed,low_ai_signal:t.lowAI};
    const priority=(m.items||[]).filter(x=>['strong_ai_signal','likely_ai','human_edit_candidate'].includes(x.label)).slice(0,24);
    const rest=(m.items||[]).filter(x=>!priority.includes(x));
    const row=x=>`<article class="originRow ${esc(x.label)}"><div class="originMeta"><span>${t.paragraph} ${Number(x.paragraphIndex)+1}</span><b>${esc(labels[x.label]||x.label)} · ${esc(x.score)}/100</b></div><blockquote dir="auto">${esc(x.text)}</blockquote><details><summary>${t.details}</summary><p>${esc(x.explanation||'')}</p><code dir="ltr">Code points ${esc(x.startCodePoint)}–${esc(x.endCodePoint)} · local ${esc(x.signals?.localStyleScore)} · process ${esc(x.signals?.processScore)} · human-edit ${esc(x.signals?.humanEditCandidate)}</code></details></article>`;
    return `<section class="originMap"><div class="originHead"><div><span>AI ORIGIN MAP</span><h3>${t.originTitle}</h3></div><strong>${esc(m.knownGroundTruth?m.estimatedAIShare:m.diagnosticHighSignalShare??0)}%</strong></div><p>${t.originLead}</p><div class="originSummary"><div><span>${t.aiShare}</span><b>${esc(m.knownGroundTruth?m.estimatedAIShare:m.diagnosticHighSignalShare??0)}%</b></div><div><span>${t.strongAI}</span><b>${esc(m.counts?.strongAI||0)}</b></div><div><span>${t.likelyAI}</span><b>${esc(m.counts?.likelyAI||0)}</b></div><div><span>${t.humanEdit}</span><b>${esc(m.counts?.humanEditCandidates||0)}</b></div></div><div class="originRows">${priority.map(row).join('')}</div>${rest.length?`<details class="originMore"><summary>${t.showAll} (${rest.length})</summary><div class="originRows">${rest.map(row).join('')}</div></details>`:''}<small>${esc(m.limitation||'')}</small></section>`;
  }
  function hebrewBlock(a,lang){
    const h=a.hebrewAnalysis;if(h?.status!=='completed')return '';
    const he=lang==='he',p=h.profile,c=h.cohort,labels={
      'academic-heading':he?'כותרת מקובלת':'Conventional heading','table-of-contents':he?'רשומת תוכן עניינים':'Contents entry',bibliography:he?'רשומת מקור':'Reference entry',declaration:he?'הצהרה':'Declaration'};
    const repeat=(p.repeatedLongPhrases||[]).map(x=>`<blockquote dir="auto">${esc(x.quote)} <small>×${esc(x.count)}</small></blockquote>`).join('');
    const states=he?{not_configured:'טרם חובר',invalid_artifact:'קובץ המודל אינו תקין',insufficient_text:'נדרשות לפחות 500 מילים בעברית',unsupported_niqqud_tokenization:'הטקסט המנוקד לא אומת למודל זה'}:{};
    const excluded=(h.context.examples||[]).map(x=>`<li><b>${esc(labels[x.rule]||x.rule)}</b>: <span dir="auto">${esc(x.quote)}</span></li>`).join('');
    return `<section class="reviewChecks"><h3>${he?'ניתוח עברית לפי הקשר':'Context-aware Hebrew analysis'}</h3><p>${esc(h.notice?.[lang]||h.notice?.en)}</p><dl>
      <div><dt>${he?'מילים בגוף הטקסט':'Prose words'}</dt><dd>${esc(p.proseWords)}</dd></div>
      <div><dt>${he?'אורך משפט ממוצע':'Mean sentence length'}</dt><dd>${esc(p.sentenceLengths.mean??'—')}</dd></div>
      <div><dt>${he?'אורך פסקה ממוצע':'Mean paragraph length'}</dt><dd>${esc(p.paragraphLengths.mean??'—')}</dd></div>
      <div><dt>${he?'סימני ניקוד ל־1,000 אותיות':'Niqqud marks per 1,000 letters'}</dt><dd>${esc(p.niqqudPer1000Letters)}</dd></div>
      <div><dt>${he?'שורות מבנה ומקורות שהופרדו':'Structural/reference lines separated'}</dt><dd>${esc(h.context.excluded_lines)}</dd></div>
      <div><dt>${he?'מודל קבוצות ניסוי':'Experimental cohort model'}</dt><dd>${esc(c.status==='scored'?(he?'פעיל — מדד ניסויי':'Active — experimental score'):states[c.status]||c.status)}</dd></div>
      ${c.status==='scored'?`<div><dt>${he?'דמיון לקבוצת הייחוס (לא אחוז AI)':'Reference cohort score (not AI probability)'}</dt><dd>${Number(c.cohort_score).toFixed(3)}</dd></div>`:''}
    </dl>${c.status==='scored'?`<p>${he?'המודל אומן על עבודות ייחוס ובקרות היסטוריות. כתיבה אנושית עכשווית, עריכת AI וטקסט מעורב טרם אומתו. בבדיקה היו 11 בקרות אנושיות בלבד.':'The model was trained on reference work and historical controls. Contemporary human writing, edited AI and mixed text were not validated. Only 11 human controls were tested.'}</p>`:''}
    ${excluded?`<details><summary>${he?'מה הופרד ומדוע':'What was separated and why'}</summary><ul>${excluded}</ul></details>`:''}
    ${repeat?`<details><summary>${he?'ניסוחים ארוכים שחוזרים בתוך המסמך':'Repeated long phrases within this document'}</summary>${repeat}</details>`:''}</section>`;
  }
  function draw(a){
    const lang=preferred||(a.language?.code==='he'?'he':'en'),t=dictionary[lang],meta=a.metadata||{};
    const observations=a.observations||[];
    return `<article class="reviewCard" data-review-card dir="${lang==='he'?'rtl':'ltr'}" lang="${lang}">
      <div class="reviewTop"><span class="reviewEyebrow">${t.eyebrow}</span><label>${t.language}<select data-report-lang aria-label="${t.language}"><option value="en"${lang==='en'?' selected':''}>English</option><option value="he"${lang==='he'?' selected':''}>עברית</option></select></label></div>
      <h2>${esc(a.title?.[lang]||a.title?.en)}</h2><p class="reviewLead">${esc(a.explanation?.[lang]||a.explanation?.en)}</p>
      <div class="reviewFacts"><div><span>${t.words}</span><strong>${Number(a.wordCount||0).toLocaleString()}</strong></div><div><span>${t.edits}</span><strong>${(a.revisions||[]).length}</strong></div><div><span>${t.model}</span><strong>${esc(modelValue(a,lang,t))}</strong></div></div>
      ${hebrewBlock(a,lang)}
      ${originBlock(a,lang,t)}
      ${processBlock(a,lang,t)}
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
