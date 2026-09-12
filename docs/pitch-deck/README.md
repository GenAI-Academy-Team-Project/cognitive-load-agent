# Carestead pitch deck

Open `carestead-pitch.html` in a browser. The seven-slide deck is self-contained: screenshots, styling, and navigation are embedded, so the HTML can be shared on its own and viewed offline.

- Left/right arrows, Page Up/Page Down, or on-screen controls move between slides.
- Home/End jump to the first/last slide.
- Notes (or N) opens presenter notes, including implementation limitations.
- Print / PDF prints all seven slides. A PDF export is also included.

## Sources and evidence

The deck combines the [supplied team Google Doc](https://docs.google.com/document/d/1_Hlv_gPlCYCF3dd9ZFdntpZZZ2ugc8_bDRKyRGC0T04/edit), `project overview.docx`, the current working-tree implementation, and a local browser walkthrough. The Google Doc was successfully read after sharing access was enabled. The persona is illustrative and the app data is synthetic. Team email addresses are intentionally omitted from the deck.

Code evidence:

- Recipient model and handover: `web/app/page.tsx`, `web/app/api/state/route.ts`, `web/db/schema.ts`
- Chat, scoped retrieval, action proposals and execution: `web/app/api/chat/route.ts`, `web/components/care-chat.tsx`
- Baseline risk decisions: `web/lib/risk-engine.ts`
- Roles, sessions and guardrails: `web/lib/auth.ts`, `web/lib/sessions.ts`, `web/lib/guardrails.ts`
- Evals: `web/benchmark/scenarios.json`, `web/benchmark/report.mjs`, `web/lib/benchmark.ts`

The current application uses email/password accounts and sessions, superseding the older design description of private-Site identity headers. The [project README](../../README.md#authentication-and-authorization) and [authentication guide](../authentication.md) describe the implemented account flow. The current agent is deterministic; external calendar, pharmacy, email and SMS integrations, richer risk reasoning, and continuous monitoring should not be inferred from the broader design proposal.

## Account flow for presenters

Before the product walkthrough, create the deployment’s first owner at `/sign-up`, or use `/sign-in` for an existing account. The owner can invite a caregiver or viewer through **Care circle → Invite member** and share the single-use, seven-day enrollment link. A later account needs that invitation and the matching email; an ordinary sign-up does not create another independent household.

The sign-in and sign-up pages reuse the dashboard’s fonts, theme tokens, and form components. Eye icons reveal or mask each password field independently. A successful sign-in opens the authorized care plan; **Sign out** revokes the current session. If demonstrating multiple roles, use separate browser profiles.

The architecture flow starts with a valid account session, then active membership and recipient authorization, before the agent retrieves care records. Account access and consequential-action approval are separate checks. The [authentication flow and sequence diagrams](../authentication.md#request-and-authorization-flow) complement slide 5; the deck’s saved screenshots and walkthrough results remain evidence of the captured session.

## Verification

The app was started locally; exploration used a separate Vite server on `http://127.0.0.1:3100` with `CARESTEAD_TEST=1` and ephemeral synthetic data. Browser automation used locally installed Chrome. `exploration.json` records observed screens and checks. `verification.json` records the generated deck's layout and navigation checks.

`npm run benchmark` reproduced 76% evidence retrieval, 81% severity accuracy, 94% approval-label agreement, 75% action-class accuracy, and 12/16 joint severity/policy/action passes. Retrieval uses expected-string matching. The joint pass count does not require perfect retrieval. The CLI reproduces the baseline rules; the UI scorer invokes the application risk engine. Neither metric set is a clinical evaluation.

Four failing scenarios: `transport-003`, `appointment-002`, `checkin-002`, `memory-002`. The unanswered-check-in scenario includes a missed escalation and incorrect approval label, so 94% policy agreement is not a safety certification.

Browser voice was inspected in code, not tested with microphone input. Automated accessibility checks do not establish complete accessibility conformance. Security and consent controls were inspected rather than exhaustively penetration-tested. No patient outcomes or reductions in caregiver effort were measured.

## Rebuild

`python3 docs/pitch-deck/build.py` embeds the captured screenshots and produces the HTML. `node docs/pitch-deck/verify.mjs` checks the deck in Chrome and generates the PDF and slide previews. These scripts require the existing project dependencies and local Chrome.
