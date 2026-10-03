# Context-aware Hebrew analysis (2026-10-03)

The scan report now separates conventional academic headings, contents entries, references and declarations from substantive prose. This is a reproducible context policy, not semantic understanding. Substantive discussion containing "תוכן עניינים" stays eligible. Original UTF-16 offsets and the source hash remain intact.

The prose profile reports sentence/paragraph distributions, lexical diversity, punctuation, niqqud density and verified eight-word repetitions with at least five distinct non-function words. Repetitions never cross excluded lines or paragraphs. These observations are not AI attribution. DOCX paragraph diagnostics use the filtered body and no longer return an estimated AI share; the interface calls the old score an uncalibrated diagnostic.

`EMET_HEBREW_COHORT_MODEL` loads a separately reviewed private numeric artifact, never student text or training IDs. The frozen Python-trained 111-feature classifier runs unchanged on original text for inference parity. It distinguishes the original owner-attested reference cohort from historical university controls, not generic human/AI authorship. It needs 500 Hebrew tokens, leaves AI probability null, exposes domain-shift limitations, and does not alter the final authorship verdict. Invalid artifacts fail closed. Only model version/hash and operational status appear in public configuration.

The existing pilot holdout has 92 references and 11 historical human controls (90 true positives, 11 true negatives, 2 false negatives, 0 observed false positives). The tiny human control sample, genre/topic/date confounding, edited AI and contemporary human writing prevent a generic AI accuracy claim. The deployed coefficients and private parity samples are not committed.

Scan memory stores a numeric profile, context rule version, counts, source hash, timestamp and model artifact hash in the existing scan metadata. It uses the authenticated user's JWT and the existing INSERT/SELECT ownership policies rather than requiring a service-role key. Raw passages are omitted from the profile snapshot. This does not add scans to training automatically. Both file and pasted-text scans return an explicit saved/failed/not-configured status. Existing scan findings and file metadata continue to be stored separately.

Validation: `npm test`; five private Python/Node score parity fixtures matched exactly (maximum absolute error 0). Local dependency setup used `npm ci --ignore-scripts` because downloading the existing C2PA binary was network-blocked; the text tests do not exercise that native binary. Production Docker installation retains normal postinstall and test steps.

Remaining work: matched contemporary human control collection, a fresh locked multilingual/edited/mixed benchmark, retraining the classifier on contextual prose, model calibration, corpus similarity retrieval inside EMET, and authenticated live scan verification. The emet-one.com custom domain returned 404 for `/api/config` while the Railway domain served the existing API; routing requires separate confirmation.

Additional input guard: the pilot requires at least 500 actual Hebrew words and abstains when over 5% are marked with niqqud/cantillation, because its frozen tokenizer splits marked words. The prose profile still measures them. Hebrew punctuation characters are not counted as niqqud.
