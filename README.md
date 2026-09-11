# EMET ONE

EMET ONE is a multi page verification intelligence website focused on document authenticity, fraud review, legal document checks, receipt and invoice verification, and connected evidence workflows.

## Live site

https://website-production-ceb1.up.railway.app/

## Pages

- `index.html` — Home
- `verify.html` — Verify anything
- `legal.html` — Legal document verification
- `receipts.html` — Receipt and invoice verification
- `fraud.html` — Fraud and deception review
- `integrations.html` — Integrations and connected sources
- `how.html` — How it works

## Shared assets

- `styles.css` — responsive design system, menu, loading screen, section cursors, hidden evidence layers and interaction styles
- `app.js` — navigation, loading transitions, mobile behavior, reading progress and the section-aware cursor engine

## Interaction layer

Every page boots through a short verification loader (counter, page-specific log lines from `data-boot`, module name from `data-module`, curtain wipe). Each hero carries a live scene declared with `data-visual` (`graph`, `console`, `receipt`, `pages`, `orbit`, `pipeline`) and a hidden X-ray layer generated from `data-xray` / `data-faces`: the con behind the copy, revealed under the cursor. The fraud stage also runs a WebGL domain-warp field (`data-gl`).

Reusable sections, all vanilla: `.hscroll` (scroll-pinned horizontal gallery), `.stackSec` (sticky stacking cards), `.redlineSec` (scroll-scrubbed tracked changes), `.compare` (drag slider), `.planner` (interactive case builder), `.prox` (proximity-lit tiles with a cable cursor), `.switch` (permission toggle via `:has()`), `.gauge` (confidence arc that stops at 87), `.dict` (hover-decoded phrases), `.flags`, `.faqs` (`::details-content` transitions), `.scrollText` (scroll-lit manifesto), `.bigMarquee`, `.stats` counters. Page navigation uses cross-document View Transitions where supported.

## Section cursors

On desktop the native cursor is replaced by one cursor with an identity per page (`data-cursor` on `<body>`) that zones can override:

- `mask` (Fraud) — a grinning con-man mask with flickering phrases; `SUSPECT` on cards and flags
- `stamp` (Legal) — a rubber stamp; clicking an exhibit leaves VERIFIED / DISPUTED marks
- `tape` (Receipts) — a paper tape that ticks line items as you move
- `probe` (Verify) — a spinning probe with READING / EXTRACTING / MATCHING states
- `plug` (Integrations) — a plug that draws a live cable to the nearest source tile
- `scan` (How it works) — a crosshair with X / Y readout

Zone modes:

- `lens` — an inverting disc over the heroes, and a glass loupe that reveals the annotated document in the home visual
- `inspect` — a dashed selection box with an OPEN CASE / INSPECT label on the case cards
- `scan` — crosshair with live X / Y readout on the process steps
- `link` — orbiting source nodes on the integrations grid
- `verdict` — a status stamp (confirmed / conflict / review / unknown) that follows the evidence rows
- `ledger` — a recalculating Σ readout on the receipt cards
- `xray` — a torch that reveals a hidden evidence layer (`.xray`) in the blue quote and the dark CTA

Touch devices keep the native cursor; hidden layers drift slowly instead so they stay discoverable. `prefers-reduced-motion` disables all of it.
- `Dockerfile` — Railway deployment

## Deployment

The `main` branch is connected to the Railway `emet-one` project. Updates pushed to this repository deploy to the production website.
