# Care ahead

Open **Care Organizer → Your week ahead**. This release adds five connected planning features to the existing review and caregiver-acceptance flow.

## Weekly forecast and preferences

The forecast shows seven local calendar days, your planned minutes for the selected recipient, unconfirmed coverage, overlapping commitments, and visits outside a confirmed preferred time window. Overnight tasks contribute minutes to each day they overlap. Completed and archived work is excluded; overdue responsibilities are called out separately.

In **Make this plan fit your family**, save your daily capacity and in-app digest hour. These settings belong to your account and selected recipient. The initial capacity is an editable 120-minute planning limit, not an estimate of what a caregiver can safely manage.

A caregiver can connect a verified fact to explicitly confirmed visit hours. This preference is shared with the care circle. It is paused if its source changes, expires, is archived, becomes disputed, or needs verification. Suggested moves respect recorded availability and task dependencies; the proposal displays its source and rechecks it on approval. Google-linked appointments still use Calendar for external guest updates.

Coverage suggestions use recorded availability, capabilities, preferred backups, and current assigned task durations. Preparing or approving a request does not change ownership: the receiving caregiver must accept it.

## Recurring care

Save a title, category, interval of 1–365 days, and next local date/time. **Review next occurrence** creates a proposal. Approval creates one unassigned responsibility and advances the routine by the chosen number of local calendar days. Duplicate approvals and proposals for changed or removed routines cannot create duplicate tasks. Stopping a routine preserves already-created responsibilities.

The next occurrence is prepared on request. There is no scheduled task-creation worker. Past dates require review; daylight-saving gaps and repeated times require a different time. These are care-plan routines, not recurring Google Calendar events.

## Visit preparation

Choose an appointment to propose transport confirmation two days before, questions/paperwork one day before, and a follow-up reminder one day after. Past reminder dates are omitted, not marked complete. The checklist is proposed as a bundle for review and can be declined. Unchanged appointment plans cannot create the same checklist twice.

Save your questions and follow-up notes, then copy a brief containing saved notes, up to 20 caregiver-recorded events from the last 14 days, current verified facts, and open related/general responsibilities. Review relevance before sharing. The brief does not infer clinical changes or medical instructions. Saved follow-up text can become a reviewed task proposal with an explicit due date.

Notes are shown only to their author in the app, but are included in the recipient owner's data export. Turning follow-up notes into a proposal explicitly shares that text with the circle.

## Personal attention

**My attention** keeps your pending coverage offers, shared pending plans, and unread approval/risk notices visible. Routine unread updates are folded until your configured hour in the recipient's time zone, with **View updates now** always available. Disable focus mode to show them immediately.

This is an in-app presentation preference. It does not schedule messages or alter separately configured email, SMS, or push delivery. The ordinary Notifications view remains available.

## Data and verification

All new data is recipient-scoped. Existing role checks, consent withdrawal, rate limits, source validation, and approval locking apply. Settings, routines, notes, preference sources, and generation receipts participate in recipient export and deletion. Notes and routine definitions are durable care-plan data rather than expiring event history.

Forecasts use recorded tasks and explicit settings, not a trained predictive model, personal-calendar free/busy, travel-time estimates, or workloads from other recipients. They do not run in the background or estimate burnout.

The Drizzle migration is `web/drizzle/0011_late_moondragon.sql`; local database bootstrap also creates the tables.

Checks:

```sh
cd web
npx tsc --noEmit
npm run test:planning
npx playwright test tests/care-ahead.spec.ts
```

Service tests cover approval/acceptance, duplicate prevention, stale preferences and routines, overnight load, DST, recipient/member isolation, and omitted past preparation dates. Browser tests cover saved preferences, recurring-task approval, visit notes, mobile layout, accessibility, access checks, and consent withdrawal.

## Organizer integration checks

The forecast includes routines awaiting approval on their next date and links overdue routines to date review. Unapproved routine time is not counted as assigned workload. Visit suggestions check 15-minute starts and exclude tasks with missing required verified facts. Newly generated preparation tasks retain their appointment dependency for visit briefs and scheduling simulations. Existing preparation tasks are not automatically relinked.
