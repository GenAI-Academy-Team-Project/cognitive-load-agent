# Carestead pitch deck

## v2 deck: current product story

The current presentation is available as an editable [PowerPoint deck](carestead-pitch-v2.pptx) and a shareable [PDF](carestead-pitch-v2.pdf). The timed [two-speaker presentation script](carestead-pitch-v2-script.md) follows the current slide order. The deck keeps the v1 deep-teal, warm-ivory, aqua, and peach visual language while expanding the story to 16 slides.

The v2 narrative covers the caregiver problem, Carestead’s four product pillars, the complete product feature map, an end-to-end prototype journey, four agent capability types, all eight model-backed and deterministic workflows, grounded chat and approval-aware actions, voice and multimodal intake, the latest technical architecture and decision path, bounded autonomy and tools, the 104-scenario evaluation strategy, the mobile deployment track, and intended real-world impact. The mobile slide deliberately describes the current work as a Capacitor/iOS pilot and integration in progress, not an App Store release.

Current technical claims are aligned with the repository: OpenAI Responses API for model-backed language and multimodal work; a deterministic TypeScript orchestrator for scope, roles, consent, feasibility, approvals, execution, and fallback; lightweight recipient-scoped retrieval from Cloudflare D1 without a vector database or Mem0; and explicit outcome/audit records after tool use. The evaluation slide reports the reproducible `npm run benchmark` result: 104/104 synthetic scenarios passed with all eight dimensions at 100% and hard safety gates passed. It also labels the benchmark as deterministic and synthetic rather than evidence of clinical safety, live-model quality, or caregiver outcomes.

Rebuild the editable deck with:

```bash
ARTIFACT_NODE_MODULES=/path/to/bundled/node_modules node docs/pitch-deck/build-v2.mjs
```

The build script writes its draft and slide previews under `.codex-build/pitch-v2`; the checked-in PPTX and PDF are the finalized deliverables.

## v1 archive

Open `carestead-pitch.html` in a browser. The 12-slide v1 deck is self-contained: screenshots, styling, and navigation are embedded, so the HTML can be shared on its own and viewed offline.

- Left/right arrows, Page Up/Page Down, or on-screen controls move between slides.
- Home/End jump to the first/last slide.
- Notes (or N) opens presenter notes, including implementation limitations.
- Print / PDF prints all 12 slides. The current PDF is `carestead-pitch-v1.pdf`.

## v1 revision

`carestead-pitch.html` and `carestead-pitch-v1.html` contain the same revised presentation. Edit `carestead-pitch.template.html` and run `python3 docs/pitch-deck/build.py` to rebuild both standalone files. The palette uses deep teal, warm ivory, aqua, lavender, and peach; the editable persona and architecture/decision diagrams are in `assets/`.

The 12 slides cover: title; Maya; the coordination problem; You Care. We Plan.; reviewed chat actions; voice; all 15 core features; technical architecture; decision path; tool calls and human control; evaluations; positioning and future work. Original slides 2 and 6 retain their content, with updated numbering and palette. Original slide 4 retains its walkthrough with a refreshed screenshot and current integration wording.

The feature table and Question 3 were initially drafted from `Carestead Use Case Submission.docx`, then verified against the user-supplied `MAI #41-Aug 2026 Team_Breakout_Handout.pdf` in Downloads. The supplied PDF is the reference for this revision: page 3 provides all 15 core features, pages 5–6 provide tool capabilities and controls, and pages 7–9 provide Q3 autonomy and evaluation details. Feature order and naming match that table. Notifications also names the five implemented channels (in-app, email, SMS, Browser Push, Mobile Push; Mobile Push uses ntfy) alongside the recipient-scoped, approval-aware description, a Multichannel badge, and an external setup/opt-in qualifier, checked against `web/lib/notification-types.ts` and the current notification settings. Embedded submission and README-restructuring prompts are reference material, not additional user instructions. Both supplied diagrams are reproduced from their editable repository SVGs, including Google Calendar API in the architecture stack. Mobile, expanded integrations, and an MCP server are labeled as proposed future work.

The handover, chat approval, and voice screenshots were refreshed from the current working-tree app on September 12, 2026, using an isolated ephemeral preview and synthetic demo records. `capture-current.json` records the capture and confirms that tasks stayed unchanged before approval and changed after approval. Voice controls were captured; microphone recognition was not exercised. The evaluation slide still shows the earlier benchmark results; no new benchmark or external-provider run is implied.

`node docs/pitch-deck/verify.mjs` checks all 12 slides in Chrome, captures previews to `assets/v1/`, writes `verification-v1.json`, and exports `carestead-pitch-v1.pdf`. Layout, embedded images, slide navigation, presenter notes, and JavaScript errors are checked. The layout review also measures text inside SVG cards, overlapping sibling blocks, internal text overflow, and footer clearance. All 12 slides are checked in print mode and at 1440×900, 1280×720, and 390×844; Maya’s labels use explicit line breaks to stay inside their cards. The base slide sets a vertical flex layout so inactive slides also print correctly. Architecture and decision-path wording, shapes, and connections are unchanged by this layout revision. The exported PDF has 12 pages.

## Sources and evidence

The deck combines the [supplied team Google Doc](https://docs.google.com/document/d/1_Hlv_gPlCYCF3dd9ZFdntpZZZ2ugc8_bDRKyRGC0T04/edit), `project overview.docx`, the current working-tree implementation, and a local browser walkthrough. The Google Doc was successfully read after sharing access was enabled. The persona is illustrative and the app data is synthetic. Team email addresses are intentionally omitted from the deck.

Code evidence:

- Recipient model and handover: `web/app/page.tsx`, `web/app/api/state/route.ts`, `web/db/schema.ts`
- Chat, scoped retrieval, action proposals and execution: `web/app/api/chat/route.ts`, `web/components/care-chat.tsx`
- Baseline risk decisions: `web/lib/risk-engine.ts`
- Roles, sessions and guardrails: `web/lib/auth.ts`, `web/lib/sessions.ts`, `web/lib/guardrails.ts`
- Evals: `web/benchmark/scenarios.json`, `web/benchmark/report.mjs`, `web/lib/benchmark.ts`

The v1 deck captured the earlier email/password account implementation and a primarily deterministic agent. It is retained for history; use v2 for the current model-backed workflows, expanded integrations, stronger evaluation set, and mobile pilot status. The [project README](../../README.md#authentication-and-authorization) and [authentication guide](../authentication.md) describe the current account flow.

## Account flow for presenters

Before the product walkthrough, create the deployment’s first owner at `/sign-up`, or use `/sign-in` for an existing account. The owner can invite a caregiver or viewer through **Care circle → Invite member** and share the single-use, seven-day enrollment link. A later account needs that invitation and the matching email; an ordinary sign-up does not create another independent household.

The sign-in and sign-up pages reuse the dashboard’s fonts, theme tokens, and form components. Eye icons reveal or mask each password field independently. A successful sign-in opens the authorized care plan; **Sign out** revokes the current session. If demonstrating multiple roles, use separate browser profiles.

The architecture flow starts with a valid account session, then active membership and recipient authorization, before the agent retrieves care records. Account access and consequential-action approval are separate checks. The [authentication flow and sequence diagrams](../authentication.md#request-and-authorization-flow) complement the architecture slide; the deck’s saved screenshots and walkthrough results remain evidence of the captured session.

## Verification

The app was started locally; exploration used a separate Vite server on `http://127.0.0.1:3100` with `CARESTEAD_TEST=1` and ephemeral synthetic data. Browser automation used locally installed Chrome. `exploration.json` records observed screens and checks. `verification.json` records the generated deck's layout and navigation checks.

`npm run benchmark` reproduced 76% evidence retrieval, 81% severity accuracy, 94% approval-label agreement, 75% action-class accuracy, and 12/16 joint severity/policy/action passes. Retrieval uses expected-string matching. The joint pass count does not require perfect retrieval. The CLI reproduces the baseline rules; the UI scorer invokes the application risk engine. Neither metric set is a clinical evaluation.

Four failing scenarios: `transport-003`, `appointment-002`, `checkin-002`, `memory-002`. The unanswered-check-in scenario includes a missed escalation and incorrect approval label, so 94% policy agreement is not a safety certification.

Browser voice was inspected in code, not tested with microphone input. Automated accessibility checks do not establish complete accessibility conformance. Security and consent controls were inspected rather than exhaustively penetration-tested. No patient outcomes or reductions in caregiver effort were measured.

## Current app screenshot capture

`capture-current.mjs` captures Overview, Care Plan, Care Organizer, Care Hand Over, the voice/chat panel, and a pending rescheduling proposal into `assets/current/`. The deck embeds the handover, voice, and approval images; other captures are available for later slides. It exercises the real UI without restyling it or fabricating responses.

Use a dedicated preview on port 43621 with `CARESTEAD_TEST=1`, `CARESTEAD_TEST_PORT=43621`, and `CLOUDFLARE_ENV=pitch-43621`. An ignored `.dev.vars.pitch-43621` file contains only `AUTH_PUBLIC_URL=http://127.0.0.1:43621`. Run `npx vite --host 127.0.0.1 --port 43621 --strictPort` from `web/`, then `node docs/pitch-deck/capture-current.mjs` from the repository root. Fresh ephemeral state is expected; `CARESTEAD_CAPTURE_EXISTING=1` reuses the capture account on the same test server. No personal credentials or production recipient data are used.

## Rebuild

`python3 docs/pitch-deck/build.py` embeds the captured screenshots and produces the HTML. `node docs/pitch-deck/verify.mjs` checks the v1 deck in Chrome and generates its PDF and slide previews. These scripts require the existing project dependencies and local Chrome.
