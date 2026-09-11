# Carestead

Carestead is a caregiver cognitive-load agent that monitors a changing care plan, identifies coordination risks, proposes constrained actions, and records an evaluation trace for every decision.

## Product capabilities

- Shared responsibilities with owners, deadlines, and completion state
- Explainable risk detection across tasks, timeline events, and trusted facts
- Human approval before consequential actions
- Structured, source-linked memory stored in the application database
- Evaluation traces for evidence, decisions, policy checks, tool use, and outcome
- Synthetic longitudinal demo data for safe testing
- Runnable synthetic benchmark with calculated quality metrics
- Signed-in care-circle roles with server-side authorization
- Full create, view, edit, verify, complete, reassign, and archive workflows
- Multiple care recipients with an explicit recipient switcher and isolated records
- Reusable, versioned care-plan templates with recipient-specific overrides
- Privacy-safe plan cloning and de-identified custom template creation

## Architecture

The MVP is a Sites/Vinext React application backed by Cloudflare D1. The agent layer is deliberately deterministic for the initial release: it evaluates structured records with testable rules and keeps each result auditable. No Mem0 service is required. An LLM reasoning adapter can be introduced later behind explicit consent, redaction, and the same approval policy.

![Carestead technical architecture](docs/images/carestead-technical-architecture.png)

The lightweight RAG layer retrieves relevant tasks, events, and trusted facts directly from the structured care database. Every retrieval is filtered by an authorized `recipient_id`, giving the orchestrator grounded context without introducing a separate vector service for the MVP.

![Carestead system architecture](docs/images/carestead-architecture.png)

```text
Caregiver dashboard
       │
       ▼
API action layer ─── human approval gate
       │
       ├── care-state risk rules
       ├── responsibility tools
       └── evaluation trace writer
       │
       ▼
Cloudflare D1
recipients · plans · templates · record scopes
tasks · events · risks · memories · approvals · traces
```

## Key components

| Component | Responsibility |
| --- | --- |
| Caregiver dashboard | Presents risks, responsibilities, timeline events, memories, approvals, care-circle roles, and benchmark results |
| State API | Loads the care plan and validates every requested mutation |
| Agent orchestrator | Coordinates retrieval, deterministic risk evaluation, approval policy, and trace recording |
| Lightweight RAG | Selects structured tasks, events, and trusted facts as grounded context; no separate vector service is required |
| Responsibility tools | Create, edit, assign, complete, and archive care tasks |
| Memory tools | Create, edit, verify, and archive source-linked trusted facts |
| Approval gate | Prevents consequential recommendations from becoming actions without caregiver review |
| D1 database | Stores operational state, care-circle membership, audit records, and evaluation traces |
| Recipient access boundary | Links each signed-in member to only the people they may access and assigns a per-recipient role |
| Plan template manager | Instantiates built-in plans, records personal overrides, saves de-identified templates, clones structure, and applies opt-in upgrades |

The current release uses one care-state agent, not a multi-agent system. Its decision engine is intentionally deterministic so every rule can be tested against known outcomes. A future LLM adapter can assist with reasoning while remaining behind the same retrieval, policy, and approval controls.

## Care-recipient and reusable-plan model

Each person has a durable care-recipient record and one active care plan. A plan points to a template key and version; edits to instantiated responsibilities are preserved as recipient-specific overrides. The product includes four starting points:

- Aging at Home
- Medication Support
- Post-Discharge: 30 Days
- Mobility & Physiotherapy

Creating a recipient instantiates fresh responsibilities from the latest selected template. Template upgrades are never automatic: the owner reviews and applies them, new responsibilities are added, and existing personal edits are not overwritten.

“Save as template” creates a reusable custom template from active responsibility structure. Person names are replaced and medication-specific responsibility text is normalized. “Clone plan” creates a new recipient with fresh, unassigned responsibilities. Neither operation copies memories, events, risks, approvals, traces, outcomes, or care-circle membership.

Operational tables remain compact and are connected to a person and plan through `record_scopes`. This provides one authorization and retrieval boundary across tasks, events, memory, risks, approvals, and agent traces.

## Agent decision path

The agent retrieves relevant records, checks whether the evidence is sufficient, evaluates risk, and routes consequential actions through a caregiver approval gate. Each path ends in a recorded, scoreable outcome.

![Carestead agent decision path](docs/images/carestead-decision-path.png)

## Responsibility and memory lifecycle

Caregivers can create, inspect, edit, and archive responsibilities. Responsibilities may also be reassigned, scheduled, marked due soon, completed, or reopened through editing.

Long-term memory is limited to explicit source-linked records. New facts begin in `review_due`, can be verified by a caregiver, corrected when inaccurate, and archived when obsolete. Archiving keeps the audit history while preventing the record from being used as active context.

## Authentication and authorization

The deployed application uses the private Site's authenticated-user headers. It does not store passwords. On the first authenticated visit, the initial user becomes the care-circle owner. Owners can record an email invitation and role in Carestead; the same email must also be granted access through the private Site's sharing controls before that person can visit and activate the membership.

Roles are assigned per care recipient and enforced in every API write path:

- **Owner:** manages members and roles and can change all care records.
- **Caregiver:** can manage responsibilities, memories, approvals, and agent checks.
- **Viewer:** can inspect the care plan and evidence but cannot change records.

Every mutation is attributed to the signed-in user in `audit_entries`. Client-side button visibility is only a usability feature; the API remains the authorization boundary.

## Benchmark and evaluation

The checked-in benchmark contains 16 synthetic scenarios across medication, transportation, appointments, check-ins, household needs, memory quality, and robustness. Each scenario supplies tasks, events, memories, and ground-truth labels for expected evidence, severity, approval policy, and action class.

Run it with:

```bash
cd web
npm run benchmark
```

The Evaluations view runs the same benchmark and displays calculated retrieval, decision, policy, and action scores. Version 1 deliberately includes hard cases the baseline agent does not solve, making failures visible for regression-driven improvement.

Benchmark files are in `web/benchmark/`:

- `scenarios.json` — machine-readable scenarios and ground truth
- `schema.json` — benchmark record contract
- `report.mjs` — command-line scorer
- `README.md` — methodology and limitations

## Data model

| Table | Purpose |
| --- | --- |
| `tasks` | Responsibilities, owners, deadlines, categories, and status |
| `events` | Timestamped source activity and agent actions |
| `memories` | Trusted facts with source, confidence, and review state |
| `risks` | Detected coordination risks and proposed actions |
| `approvals` | Human decisions for consequential recommendations |
| `traces` | Trigger, evidence, decision, policy, tool, and outcome |
| `households` | Care-plan container |
| `care_circle_members` | Signed-in identities, invitations, and roles |
| `audit_entries` | Attributed record-change history |
| `care_recipients` | The people receiving care and their timezone/status |
| `care_plans` | Active plan, source template key/version, and lifecycle |
| `plan_templates` | Built-in and de-identified custom template versions |
| `template_responsibilities` | Portable responsibility definitions and due offsets |
| `template_risk_rules` | Portable detection and approval expectations |
| `record_scopes` | Recipient/plan ownership for every operational record |
| `recipient_members` | Per-recipient access and owner/caregiver/viewer role |
| `plan_overrides` | Recipient-specific responsibility edits preserved across upgrades |

## Supported API actions

The `/api/state` endpoint exposes authenticated, recipient-scoped reads and permission-checked actions for responsibility creation, editing, completion and archival; memory creation, editing, verification and archival; approval decisions; ride assignment; agent checks; and care-circle membership management. It also supports care-recipient creation, plan cloning, de-identified template saving, and owner-approved template upgrades.

## Run locally

```bash
cd web
npm install
npm run dev
```

The application creates and seeds its D1 tables on first use. To create a checked-in SQL migration after schema changes, run `npm run db:generate`.

## Safety scope

This is a care-coordination prototype, not a clinical decision system. It does not diagnose, prescribe, or independently contact people or providers. High-impact actions require caregiver approval and remain visible in the event and evaluation history.
