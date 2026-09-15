# Carestead

Carestead is a caregiver cognitive-load agent. It keeps a care recipient’s plan, responsibilities, schedule, trusted information, contacts, and recent activity in one place; detects coordination risks; answers questions with visible evidence; and requires caregiver approval before consequential actions.

Carestead supports care coordination only. It does not diagnose, prescribe, replace clinical judgment, or replace emergency services.

![Carestead core product features](docs/images/carestead-core-features.png)

## Why Carestead

Caregiving is not one task—it is the ongoing work of remembering what changed, who owns the next step, which information is current, and what could fall through the cracks. Carestead maintains one recipient-scoped operational picture so caregivers can move from “What am I missing?” to “What needs attention?” and “What should happen next?”

## Core product features

| Product area | What it provides |
| --- | --- |
| **Care recipient and profile** | An isolated profile for each person, including care context, preferences, access notes, key contacts, and support systems. |
| **Care plan and templates** | Reusable, versioned plans that can be personalized, safely cloned, and applied to another person without copying private history. |
| **Care Circle and intelligent handover** | Recipient-specific roles plus a live handover and an on-demand AI brief of current state, risks, priorities, changes, and supporting evidence. |
| **Care Organizer, calendar, and timeline** | Plans breaks and recurring care, organizes free-form updates into reviewable tasks, connects appointments to Google Calendar, and preserves actions and outcomes in chronological context. |
| **Grounded chat and voice** | A model-backed copilot answers recipient-specific questions from visible evidence, with microphone input and spoken replies where the browser supports them. Raw audio is not stored. |
| **Approval-aware actions** | Chat can prepare rescheduling, assignment, task, notification, and care-check actions. Authorized caregivers review the exact proposal before it executes. |
| **Risk checks and memory** | Explainable coordination-risk rules and durable, source-linked facts with verification and review status. |
| **Privacy and evaluation** | Consent, recipient access, retention, export, deletion, audit history, rate limiting, accessibility checks, and trajectory-level evaluation. |

## Product walkthrough

The screenshots below use synthetic demonstration data.

### Reusable care plans

Caregivers can start with a built-in plan, personalize its responsibilities, save a de-identified template, or clone the plan structure for another person. Recipient history, memories, approvals, and past outcomes remain isolated.

![Carestead reusable care plan and templates](docs/screenshots/care-plan.png)

### Grounded chat with voice controls

Ask Carestead answers from the selected recipient’s current profile and care state. The microphone starts browser speech recognition, spoken replies can be enabled separately, and only transcript text is retained.

![Carestead grounded chat with voice controls](docs/screenshots/voice-chat.png)

### Appointment rescheduling with caregiver approval

An appointment request becomes a typed proposal. Carestead shows the intended change and supporting evidence, but no write occurs until an authorized caregiver approves it.

![Carestead appointment rescheduling approval](docs/screenshots/appointment-approval.png)

### Multi-channel notifications

Caregivers can choose a message template, select a receiving care-circle member, and prepare notifications for the Carestead inbox, mobile push, email, SMS, or browser push. Each selected channel gets its own approval draft; external delivery requires the channel to be configured and the receiving caregiver’s settings to allow it.

![Carestead notification composer with message templates and multiple delivery channels](docs/screenshots/multi-channel-notifications.png)

## How the agent works

Carestead uses one hybrid care-state agent rather than a group of unconstrained agents. The model handles language understanding and grounded synthesis; deterministic code owns authorization, validation, risk rules, approvals, tool execution, and fallback behavior.

1. **Observe:** receive a question, risk signal, or requested action for the selected recipient.
2. **Retrieve:** load only that recipient’s relevant profile, tasks, events, trusted facts, risks, contacts, approvals, and recent traces.
3. **Decide:** determine whether the evidence is sufficient and whether the request needs an answer or an action.
4. **Constrain:** apply role, consent, validation, impact, and approval rules outside the model.
5. **Act:** execute only an allowed, recipient-scoped tool after any required caregiver approval.
6. **Verify and record:** observe the result and save the evidence, decision, policy, tool, action, and outcome trace.

![Carestead agent decision and approval path](docs/images/carestead-decision-path.png)

## Architecture

The caregiver experience calls authenticated server routes that enforce identity, recipient-level access, consent, validation, and rate limits. The orchestrator retrieves structured, recipient-scoped records from Cloudflare D1, evaluates the current care state, and produces either a grounded answer or a constrained action proposal. Consequential writes pass through the policy and caregiver-approval gate. Approved tools update operational data, and every result is written to the audit and evaluation trail.

![Carestead technical architecture](docs/images/carestead-technical-architecture.png)

### Key components

| Component | Responsibility |
| --- | --- |
| **Caregiver experience** | Dashboard, recipient switcher, plans, responsibilities, timeline, handover, Care Circle, notifications, privacy controls, chat, and voice. |
| **Authenticated API boundary** | Authentication, recipient authorization, consent, input validation, throttling, and privacy-safe errors. |
| **Agent orchestrator** | Coordinates model-backed language tasks, retrieval, evidence validation, deterministic risk evaluation, action selection, approval policy, and trace recording. |
| **Lightweight RAG** | Retrieves exact structured records by authorized `recipient_id` and returns those records as visible evidence. |
| **Policy and approval gate** | Prevents prohibited, unauthorized, or unapproved consequential actions. |
| **Care tools** | Manage responsibilities, scheduling, assignments, notifications, trusted facts, profiles, handovers, and care checks. |
| **Cloudflare D1** | Stores recipient care state, conversations, approvals, audit entries, notifications, and evaluation traces. |

### Why lightweight RAG

The important MVP information is already structured, attributable, and time-sensitive. Carestead therefore retrieves exact rows from D1 instead of relying on a separate vector index. Every query is filtered by an authorized recipient identifier. The model receives compact records with stable evidence IDs, and its citations are rejected if they do not map back to those records.

## Tech stack

| Layer | Technology |
| --- | --- |
| **Frontend** | TypeScript, React 19, Vinext, Tailwind CSS |
| **Backend** | Vinext server routes on Cloudflare Workers |
| **Database** | Cloudflare D1 with Drizzle ORM |
| **Agent** | OpenAI Responses API with strict JSON Schema outputs, plus a deterministic TypeScript orchestrator and fallback |
| **Retrieval** | Recipient-scoped structured retrieval from D1 |
| **Voice** | Browser speech recognition and speech synthesis; transcript-only retention |
| **Authentication** | OpenAI Sites authenticated-user headers plus server-enforced recipient roles |
| **Testing** | Playwright, axe-core, synthetic benchmark runner, GitHub Actions |
| **Hosting** | OpenAI Sites and Cloudflare infrastructure |

Set `OPENAI_API_KEY` in `web/.dev.vars` for model-backed chat, care-update extraction, and handover briefs. `OPENAI_MODEL` defaults to `gpt-5.6-terra`, and `OPENAI_REASONING_EFFORT` defaults to `low`. Model requests use `store: false`; when the key or service is unavailable, the product continues with its deterministic local behavior.

## Memory, access, and safety

- Long-term memory is limited to explicit, source-linked facts stored in D1. Facts can be reviewed, verified, corrected, or archived.
- Every operational record is scoped to one care recipient. Owners, caregivers, and viewers receive different server-enforced permissions.
- Consequential actions require explicit approval; rejection or timeout produces no change.
- Consent withdrawal pauses care-record mutations, chat, voice, checks, and notifications.
- Owners can export recipient data or use a verified permanent-deletion workflow.
- External notification delivery requires configured providers, the receiving caregiver’s channel settings, and approval of the notification draft.

## Evaluation strategy

The checked-in benchmark contains 16 synthetic caregiving scenarios covering medication coordination, appointments, transportation, household needs, memory quality, and robustness. Each scenario has known expected evidence, severity, approval policy, action class, and outcome.

Carestead scores the full trajectory:

- **Retrieval:** Did the agent use the correct recipient-scoped evidence?
- **Decision:** Did it identify the correct risk or need for clarification?
- **Policy:** Did it apply access and approval rules correctly?
- **Tool selection:** Did it choose an allowed action that matched the scenario?
- **Outcome:** Did it verify success or report failure honestly?

Run the benchmark with:

```bash
cd web
npm run benchmark
```

Accessibility and browser workflow checks cover the main product surfaces, grounded chat, and approval-gated execution:

```bash
cd web
npm run test:accessibility
```

Benchmark details are available in [`web/benchmark/README.md`](web/benchmark/README.md).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
cd web
npm install
npm run dev
```

The development application creates and seeds its D1 tables on first use. After schema changes, generate a checked-in migration with `npm run db:generate`.

## Current scope

Carestead is a care-coordination prototype, not a clinical decision system. It does not make diagnoses, recommend medication changes, determine whether a situation is medically safe, or independently contact people or providers. High-impact actions remain under human control and visible in the activity and evaluation history.
