# Architecture and technical reference

[Back to Carestead](../README.md) · [Documentation index](README.md)

Implementation detail for the care-state agent, application boundaries, and core storage model. Feature-specific schemas and operating limits are linked in the [documentation index](README.md).

## Architecture

The **Care planning** view also includes a seven-day workload forecast, verified preference-aware visit suggestions, reviewed recurring tasks, appointment preparation briefs, and a personal in-app attention digest. See [Care ahead](care-ahead.md) for behavior, data boundaries, and verification.

The MVP is a Vinext React application backed by Cloudflare D1. The agent layer is deliberately deterministic for the initial release: it evaluates structured records with testable rules and keeps each result auditable. No Mem0 service is required for local recall. Owners can optionally enable Mem0 semantic recall of verified facts for each recipient. Optional OpenRouter summaries and bounded scheduling assistance remain opt-in. See [optional assistance setup](optional-assistance.md).

![Carestead technical architecture](images/carestead-technical-architecture.png)

The lightweight RAG layer retrieves relevant tasks, events, and trusted facts directly from the structured care database. Every retrieval is filtered by an authorized `recipient_id`, giving the orchestrator grounded context without introducing a separate vector service for the MVP.

The browser experience includes sign-up and sign-in pages. Authentication endpoints validate credentials and issue an HttpOnly session cookie; care APIs resolve that session to an active member and check recipient access before returning data. Account, session, and invitation records live in D1 alongside the care data.

The browser experience, authenticated API boundary, agent orchestration, retrieval, approval policy, tools, durable data, and evaluation loop are shown together above. Questions can return grounded answers immediately; action requests become typed proposals and cross the approval gate before any tool is allowed to write.
## Key components

| Component | Responsibility |
| --- | --- |
| Account pages and sessions | Shared sign-up/sign-in forms, password visibility controls, hashed passwords, expiring cookies, and sign-out |
| Invitation enrollment | Owners issue or renew single-use links; matching-email sign-up activates recipient-scoped membership |
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
| Caregiver handover | Consolidates the recipient profile, latest event, unresolved risks, pending reviews, upcoming responsibilities, support contacts, and authorized care team |
| Policy guardrails | Applies validation, authorization, consent status, throttling, approval policy, auditing, and privacy-safe error handling before actions |
| Carestead chat | Saves a separate caregiver conversation for each recipient, retrieves only authorized profile records, exposes evidence, and turns action requests into reviewable proposals |
| Voice controls | Uses supported browser speech recognition and speech synthesis; only the resulting text enters chat history and raw audio is not stored |

The current release uses one care-state agent, not a multi-agent system. Its decision engine is intentionally deterministic so every rule can be tested against known outcomes. An optional LLM adapter drafts daily reviews and handovers from the deterministic summary and evidence. It cannot execute actions; existing retrieval, policy, and approval controls remain in place.
## Agent decision path

The agent retrieves relevant records, checks whether the evidence is sufficient, evaluates risk, and routes consequential actions through a caregiver approval gate. Each path ends in a recorded, scoreable outcome.

![Carestead agent decision path](images/carestead-decision-path.png)
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
| `auth_accounts` | Unique email/password accounts and salted password hashes |
| `auth_sessions` | Hashed session tokens, account links, and seven-day expiry |
| `auth_invitations` | Hashed single-use enrollment tokens and seven-day expiry |
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
| `recipient_profiles` | Concise caregiver-entered handover context and urgent-plan guidance |
| `support_contacts` | Recipient-scoped people, providers, and support services |
| `consent_records` | Purpose, consent status, grant/withdrawal timestamps, and retention choice |
| `notifications` | Approval-aware in-app notices |
| `notification_preferences` | Per-caregiver channel opt-in and push subscription |
| `notification_deliveries` | Durable tool execution claims and provider outcomes |
| `notification_reads` | Per-caregiver read receipts |
| `data_requests` | Export and content-free deletion accountability records |
| `rate_limit_events` | Short-lived counters for per-user action throttling |
| `error_events` | Privacy-safe request/error metadata for operational monitoring |
| `chat_threads` | One durable recipient/member conversation boundary |
| `chat_messages` | User/assistant transcripts, grounded evidence, and linked action cards |
| `chat_action_requests` | Proposed tools, validated payloads, approval state, and execution timestamps |
## Supported API actions

| Authentication route | Purpose |
| --- | --- |
| `POST /api/auth/sign-up` | Create the first owner or enroll with a valid invitation; issue a session |
| `POST /api/auth/sign-in` | Validate credentials and active membership; issue a session |
| `GET /api/auth/session` | Return the current account identity or `401` |
| `POST /api/auth/sign-out` | Revoke the current session and clear its cookie |

Owner-only `invite_member` and `renew_invitation` actions on `/api/state` return enrollment links for pending members. See the [API reference](authentication.md#api-reference) for fields, cookie/Origin requirements, and error responses.

The `/api/state` endpoint exposes authenticated, validated, rate-limited, recipient-scoped reads and actions for responsibilities, memories, profiles, contacts, consent, notifications, approvals, agent checks, care-circle membership, plan templates, cloning, upgrades, and verified deletion. `/api/chat` retrieves grounded recipient context, saves conversation history, proposes typed tools, and executes approved actions. `/api/export` produces an owner-only recipient export. `/api/health` returns a non-sensitive availability check.
