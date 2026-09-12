# Care planning

Carestead now supports caregiver relief, care-plan simulations, reviewed update extraction, personal handover changes, care-fact conflict resolution, and small-task participation.

## Try the workflows

1. Open **Care Organizer → Task planning**. Choose actual care-circle members, review task durations, and optionally set a preferred backup, capabilities, required care facts, and a “Moves with” dependency. Invited and viewer accounts cannot receive assignments. Existing named assignments need acceptance to count as confirmed coverage.
2. Each caregiver opens **I can help** and shares availability, task categories, and capabilities. A task must fit entirely inside a matching window and must not overlap another assignment in this recipient’s plan.
3. In **I need a break**, choose a future time window. Review proposed replacements and uncovered responsibilities. Approving the plan creates coverage requests. The original caregiver remains assigned until the requested replacement signs in and accepts. Declines, stale requests, and changed availability remain explicit.
4. In **What if?**, choose a responsibility and a new time. The preview moves dependent responsibilities by the same offset, reports conflicts, and searches a bounded set of nearby alternative times. Prepare and approve the proposal to apply it. Connected Google appointments must be changed through **Calendar** so guests are updated.
5. In **Organize an update**, speak, paste, or type an update. Review extracted clauses, choose ambiguous tasks, confirm dates and times, and remove unwanted items. Prepare the reviewed bundle, then approve it. Created tasks remain unassigned. Source text stays attached to the proposal.
6. In **Handover**, acknowledge the current picture. The next visit compares current responsibilities, care facts, profile, contacts, risks, and coverage requests with your personal checkpoint. Acknowledging an outdated snapshot is rejected.
7. In **Memory**, describe related facts with the same subject and attribute. Differing current values appear together for verification. Confirm a value and verification source to archive alternatives and link them to the replacement. Expired, superseded, unverified, and disputed facts are excluded from grounded memory recall. Link necessary facts in Task planning to hold scheduling and acceptance until those facts are verified.
8. In **I can help**, choose a time budget and claim a matching unassigned task. Claiming is an explicit acceptance and is checked against availability and capabilities again on the server.

## Boundaries and implementation

- The current update extractor is deterministic and supports English clauses and explicit dates, weekdays, today/tomorrow, and AM/PM times. It does not use an LLM or infer an appointment’s time when it is missing. DST gaps and repeated wall times require correction.
- Availability and conflict checks cover one authorized care recipient. They do not infer availability from silence or inspect caregivers’ personal calendars, travel times, or other care circles. Default task duration is 20 minutes until reviewed.
- “Moves with” expresses a scheduling relationship and preserves the recorded offset, so a ride or preparation task can precede its appointment. Cyclic dependencies are rejected.
- Confirmed coverage requires the assigned caregiver’s acceptance. Changed task details invalidate the acceptance signature. Required care facts that become disputed or expired also prevent the task from counting as confirmed.
- Handover changes compare two snapshots; they are not a replay of every intermediate edit. Timeline and evaluation records retain action history.
- Browser speech recognition may use the browser vendor’s service. Carestead stores approved source text and operational records, never raw microphone audio.
- `/api/planning` checks authentication, recipient access, role, consent, and mutation rate limits. Consequential proposals are revalidated at approval. Conditional SQLite guards roll back a batch if its preconditions fail. Planning writes share the recipient mutation lease with the existing memory/state workflow.
- Planning records are included in recipient exports and permanent deletion. Proposal, offer, checkpoint, and availability history follow the recipient’s retention period. Privacy-safe errors contain metadata rather than care text.
- Migration `0010_gorgeous_doctor_strange.sql` creates the planning tables. Runtime bootstrap also creates them for existing local databases. Existing task and memory table layouts remain compatible.

## Verification

From `web/`:

```sh
npm run test:planning
npm run test:accessibility
npm run build
```

The planning tests execute production SQL against an in-memory SQLite database. Browser tests exercise reviewed updates, handover changes, cross-session coverage acceptance, viewer and recipient authorization, consent withdrawal, export, deletion, desktop/mobile layout, and automated accessibility checks.

To run a browser suite alongside another local test server:

```sh
CARESTEAD_TEST_PORT=43289 npm run test:accessibility
```

Browser authentication state and test traces are isolated under `.playwright-runs/<port>/`.

The synthetic benchmark now calls the same deadline-aware risk engine as the app with a fixed reference clock (`2026-09-11T16:00:00Z`). Its remaining hard-case failures are visible; it is not a clinical validation or a pass/fail release gate.
