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

## Section cursors

On desktop the native cursor is replaced by one cursor that changes personality per zone (`data-cursor` on the zone element):

- `lens` — a loupe that really magnifies the headline underneath (`data-magnify`) and reveals the annotated document in the hero visual
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
