# Web and mobile feature parity

Both entries render `web/components/care-dashboard.tsx`. The web page is a thin
wrapper; mobile supplies its hosted invitation origin and native export handler.
Shared components are imported directly, so future web feature changes also ship
in the next mobile build.

| Area | Shared mobile functionality |
| --- | --- |
| Overview | Care checks, coverage, risks, approvals, upcoming responsibilities |
| Care plan | Templates, new recipients, cloning, saving and upgrading plans |
| Care Organizer | Update extraction, reviewed plans, assignment, coverage, availability, routines, Care Ahead, adaptive plans, document intake |
| Responsibilities | Add, edit, complete, archive, calendar scheduling, filtering and pagination |
| Handover | AI/copy briefs, profile edits, support contacts and attention items |
| Memory | Add, correct, verify, archive, and resolve conflicting care facts |
| Care circle | Invitations, renewals, roles and membership removal |
| Calendar | Appointments, proposals, confirmation and calendar management |
| Notifications | Compose/review, inbox/read status, delivery history and preferences |
| Integrations | Service configuration, enablement and personal channel preferences |
| Privacy | Consent, retention, recipient export and recipient deletion |
| Activity and evaluations | The same logs, filters, pagination and agent traces |
| Account | Profile, password change, sign-in/up, guest, recovery and sign-out |

## Platform adaptations

- Native requests retain the existing backend authorization, consent, cookies and
  origin enforcement. JavaScript and Swift use matching explicit API allowlists.
- Document uploads preserve multipart bytes and MIME boundaries; the native
  bridge limits uploads to document intake. The backend enforces its 5 MB file
  limit and processing-consent requirement.
- Native recipient exports open the iOS share sheet. Temporary files use complete
  file protection and are removed after sharing or cancellation.
- Invitation links use the configured HTTPS website, not `capacitor://localhost`.
- Google authorization uses the existing browser flow. With a Mac backend,
  connect Google in the Mac browser, then refresh the mobile calendar.
- Browser push and speech recognition depend on platform support. Native
  APNs/OneSignal push, seamless OAuth/recovery return links, and offline writes
  are not implemented. Email, SMS and ntfy remain backend-delivered channels.
- The mobile stylesheet adds touch targets, platform fonts and safe-area spacing;
  layouts, views and controls come from the web UI.

## Verification

`npm run build` in mobile typechecks and rejects server modules in the bundle.
`npm test` exercises request isolation, route coverage, multipart byte fidelity,
session expiry and cancellation. `npm run test:e2e` runs a separate backend and
Chromium at an iPhone viewport, covering all workspace views, planning approval,
preferences, password changes/recovery, task completion, chat, recipient scope,
authentication, pagination and the Mac gateway.

These browser/transport checks do not establish WKWebView or device compatibility.
Verify native sharing, networking/session persistence, real Google authorization,
keyboard behavior and supported notifications on a signed iOS build.
