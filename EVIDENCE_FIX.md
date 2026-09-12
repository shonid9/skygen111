# Evidence reporting correction, 2026-09-12

This change fixes extraction and reporting. It does not introduce a trained AI classifier or claim an accuracy improvement without a benchmark.

## Implemented

- `evidence-text.js`: Unicode-aware word/transition matching, explicit disclosure observations with source locators, quoted/denied-statement safeguards, complete bounded extracted-text coverage. AI probability remains null.
- `evidence-document.js`: namespace-aware DOCX text/metadata extraction, no extra spaces between adjacent runs, separate retained deletions and visible text, archive limits, DTD rejection, conservative UTF-8 filename repair.
- `provenance-reader.js`: use the SDK validation state and active manifest; valid, trusted, invalid and failed remain separate. Keywords in titles/ingredients cannot authenticate an AI-origin claim. Remote retrieval is disabled.
- `review-engine.js`: exposes observed passages and the absence of a trained classifier. Legacy statistics remain uncalibrated diagnostics, not classification evidence.
- `review-ui.js` and `review.css`: source quotations and an English/Hebrew report toggle, collapsed legacy diagnostics, mobile button sizing. The marketing site remains unchanged.
- `server.js`: integration, explicit errors, fresh HTML, archive admission checks and static-asset allowlist.
- Docker builds must pass `npm test` before a new server starts.

## Evidence boundaries

A stored declaration is self-reported, not an independently verified generation history. A uniform ZIP timestamp, lack of tracked changes, or low editing time is not a finding of AI authorship. A validated source claim is not validation of the truth of a scene or every word. Existing image/audio/video checks remain forensic baselines; no neural classifier is silently simulated.

## Validation

28 unit regressions cover Hebrew boundaries and niqqud, codepoint/UTF-16 locator round trips, long-document tails, negative/quoted disclosures, visible/deleted/hidden DOCX text, metadata fields, DTD rejection, filename encoding and typed C2PA validation.

5 integration regressions run with real DOCX ZIP containers and installed production dependencies. They test source-located disclosure, ordinary exports, classifier availability, preservation of original bytes and archive size rejection.

Passing these tests is evidence of these tested behaviours, not a population-level AI detection accuracy estimate. No original user document or student text is included in this public repository.

## Outstanding

A trained classifier, held-out Hebrew/multilingual benchmark, calibrated probabilities, robust word-level authorship inference without reference versions, learned image/voice models and the complete original implementation specification remain separate unfinished work. Labels and a database schema are not model fine-tuning.
