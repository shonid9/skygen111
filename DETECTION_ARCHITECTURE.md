# EMET ONE Detection Architecture

## Core rule

EMET ONE does not turn a probability into proof. `VERIFIED_AI_PROVENANCE` is reserved for trustworthy machine-readable provenance or watermark evidence that validates successfully. Statistical detectors can raise or lower confidence, but never become cryptographic proof.

## Signal order

1. Cryptographic or provider provenance
   - C2PA Content Credentials, validated with `@contentauth/c2pa-node`.
   - OpenAI Content Provenance API when an API key is configured, for supported image/audio formats.
   - Future Google AI Content Detection / SynthID API adapter when account access is available.
2. Independent commercial detector consensus
   - GPTZero v2 text endpoint.
   - Pangram v3 text endpoint.
   - Copyleaks v2 writer detector with explain mode and high sensitivity.
3. Native file forensics
   - OOXML package metadata, revision markers, authors, hidden content, external relationships, macros, signatures and custom XML.
   - PDF incremental-update, signature, JavaScript, embedded-file, XRef and metadata signals.
   - Image EXIF/XMP generator fingerprints.
4. Manipulation and evasion analysis
   - Zero-width Unicode, bidi controls, soft hyphens, mixed-script/homoglyph tokens and prompt/assistant residue.
5. Local stylometry
   - Sentence/paragraph variance, lexical diversity, entropy, repeated n-grams, punctuation diversity, sentence-start repetition and formulaic transitions.
   - Sliding windows are shown as statistical regularity only, never as authorship proof.

## Consensus

- Verified provenance: `VERIFIED_AI_PROVENANCE`, `canProve: true`.
- Two or more independent detector providers agree on AI/AI-assisted and none disagree: high AI signal, not proof.
- Providers disagree: `INCONCLUSIVE`.
- Metadata names an AI tool: metadata evidence only.
- Prompt residue: content artifact only.
- Local statistical regularity alone: low-confidence AI-style signal only.
- No signal: inconclusive or no AI signal; never proof of human authorship.

## Known limits

No current general-purpose text detector can guarantee 100% AI-authorship detection across all models, languages, paraphrases, translations, short samples and mixed human/AI editing. Missing watermarks or Content Credentials also cannot prove human authorship because provenance can be stripped, degraded or absent.

EMET ONE's quality target is therefore 100% evidence traceability: every verdict must expose exactly which evidence created it and which parts remain unprovable.

## Calibration data

Supabase stores separate detector runs and user/verified labels so future calibration or fine-tuning can be trained on known outcomes instead of marketing claims. Provider model versions should be stored whenever returned by the API.
