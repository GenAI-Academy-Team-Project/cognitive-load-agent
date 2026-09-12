# Safety, privacy, and guardrails

[Back to Carestead](../README.md) · [Documentation index](README.md)

Carestead is a care-coordination prototype. These controls do not establish clinical safety or production readiness. See [evaluation methodology and limits](evaluations.md) for what is measured and [authentication](authentication.md) for session, role, and recovery controls.

## Approval-aware notifications

The notification inbox is recipient-scoped. Notifications linked to a consequential action begin in `needs_approval`; approving the associated plan releases them to `delivered`. Notifications from ordinary care checks are delivered in-app and can be marked read. The `send_notification` chat tool supports targeted in-app, Resend email, Twilio SMS, and Web Push delivery after explicit caregiver approval and recipient channel opt-in. Read state is tracked per caregiver; provider acceptance is distinct from confirmed delivery. See [notification setup](notification-setup.md) for credentials, supported commands, and current delivery limits. The optional Google Calendar integration sends the appointment details and guest updates explicitly approved by a caregiver.

## Recipient chat, tools, and voice

The floating **Ask Carestead** window is bound to the currently selected recipient. It answers from that person’s profile, responsibilities, timeline, risks, trusted facts, support contacts, and agent traces, and presents the exact records used under an expandable evidence section. Conversation history is stored in D1 per recipient and signed-in care-circle member rather than in Mem0.

Chat requests to reschedule an appointment, assign transportation, add a responsibility, run a care check, or post a notification create a pending action card. No write occurs until an authorized owner or caregiver selects **Approve**. Execution rechecks recipient access, updates the relevant records, and saves an evaluation trace and audit entry. Chat notification tools can use the configured channels after the addressed caregiver opts in. Google-linked appointments must be changed through the Calendar view so the caregiver reviews the external guest notifications. Email, SMS and Web Push require the runtime configuration described in [notification setup](notification-setup.md).

Voice input uses the browser’s available speech-recognition capability and spoken replies use browser speech synthesis. The transcript follows the recipient’s consent, retention, export, and deletion rules. Raw microphone audio is not saved, and typed input remains available when browser voice recognition is unavailable.

## Google Calendar appointments

The **Calendar** view uses the existing Carestead design system. Each caregiver connects their own Google account, selects an owned calendar for the current care recipient, and prepares an appointment with explicit times, time zone, guests, location, and an organizer reminder. A review card shows the exact external details before **Approve and send invite** calls Google. Rescheduling and cancellation use the same approval policy and notify guests only after approval.

Confirmed actions update the linked responsibility and recipient timeline, record an evaluation trace, and display a Google Calendar link. Stable event IDs, atomic action claims, and provider reconciliation prevent duplicate invitations on retries; ETags protect against overwriting Google edits. Credentials are encrypted and excluded from recipient exports. Gmail inbox access, background synchronization, and recurrence are not included in this milestone.

Google Cloud OAuth credentials and a token-encryption key must be configured before a real account can connect. See [Google Calendar setup and operating behavior](google-calendar-setup.md).

## Consent and retention

Each recipient has a purpose-limited consent record with active/withdrawn status, granting identity and timestamps, and a selected 30-, 90-, 365-day, or no-expiry retention period. Withdrawing consent pauses care-record mutations, chat/voice, agent checks, and new notifications while still allowing the owner to restore consent or delete the data. The retention policy removes expired event, trace, notification, chat, chat-action, and error history during recipient-state loading.

## Export and deletion

Owners can download a recipient-scoped JSON export with a versioned schema and `no-store` response policy. The export contains the profile, contacts, care team, plans, responsibilities, events, memories, risks, approvals, traces, notifications, chat history, chat actions, and consent record. Export requests are logged and rate-limited.

Permanent deletion requires the exact recipient display name, cannot delete the owner’s only remaining recipient, and removes the recipient profile, support contacts, plan, scoped operational records, notifications, chat history/actions, consent, and access mappings. A minimal content-free deletion receipt remains for accountability.

## Validation, throttling, and monitoring

Care-record mutations pass authentication, per-recipient authorization, action-specific throttling, bounded field validation, format checks, consent policy, and audit recording. Error responses include a request identifier. Monitoring stores route, action, error code, actor identifier, recipient identifier, and timestamp—never care notes, memory values, contact details, or profile text. `/api/health` exposes only service and database reachability.

## Accessibility and non-clinical scope

Playwright and axe-core tests cover Sign in, Sign up, Overview, recipient chat, Handover, and Privacy & Data surfaces against WCAG A/AA rules. A browser workflow test also verifies that chat retrieves evidence, proposes a reschedule without changing data, and executes only after approval. GitHub Actions runs these checks on pushes and pull requests:

```bash
cd web
npm run test:accessibility
```

The browser suite starts a separate server on port 43179 with an ephemeral D1 database, creates a test owner through sign-up, and checks authentication, password visibility, invitations, permissions, chat, and accessibility. It does not reuse the development database.

A persistent product footer, onboarding consent acknowledgement, approval guidance, handover notice, export notice, and privacy controls state that Carestead supports coordination only. It does not diagnose, prescribe, replace clinical judgment, or replace emergency services.

## Optional assistance and external memory

Core coordination runs locally against D1 without an LLM or external memory service. OpenRouter assistance and Mem0 recall require explicit enablement and recipient permission. Generated summaries cannot execute actions; planning assistance can call bounded simulations and propose a preview for human review. Dispatch rechecks access and consent. See [assistance boundaries](optional-assistance.md#cost-and-boundaries) and [memory lifecycle and external cleanup](memory-pilot.md#lifecycle-and-privacy).
