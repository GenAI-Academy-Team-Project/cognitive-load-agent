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
- The shared document picker now sends JSON/base64 uploads. The native bridge
  still supports legacy multipart requests, but its JSON size limit is a known
  parity defect (see the audit below). The backend enforces the 5 MB file limit
  and processing-consent requirement.
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


## Main-branch audit — 2026-09-16

Compared with freshly fetched `origin/main` at `b94a5bd`; local HEAD matched.
Reviewed the recent document-upload, native voice, integration configuration,
evaluation, and camera changes. The shared dashboard includes the updated
integration and evaluation UI, and the native API allowlists cover its endpoints.

### Addressed in this audit

Camera capture is opt-in via the mobile entry. The web entry retains ordinary
image/document uploads without rendering the camera input or button. The browser
integration test checks both entry points, including web at phone width. The iOS
bundle was rebuilt and synced.

### Remaining deviations

1. **High: native document uploads still have a 256 KiB JSON ceiling.**
   `web/components/agent-workflows.tsx` now serializes files as JSON/base64
   (introduced in `8ac226f`). `mobile/scripts/CaresteadAPI.swift` rejects JSON
   bodies over 262,144 bytes, whereas the backend allows intake JSON up to
   7,200,000 characters for a 5 MiB file. A 200 KiB file produces a roughly
   273 KiB JSON request and fails before reaching the API. Both captured photos
   and existing uploads are affected. Align the native intake-specific limit
   with the backend while retaining smaller limits for other requests, then
   verify near-limit uploads through the native bridge.

2. **Resolved in the follow-up: native voice was connected only to the global voice assistant.**
   The shared conversation and organizer now receive the same adapter as `CareVoice`.
   Mobile uses a persistent voice dock; web uses one text-and-voice assistant panel.
   Voice-first is the default on web and mobile. Profile settings persist the
   preferred input, spoken replies, and opt-in mobile startup per account; both inputs remain
   available. Tests cover injected native-style dictation, late transcripts,
   cancellation, preference persistence and account isolation.

3. **Verification gap: tests do not exercise these native boundaries.**
   The transport upload test uses multipart, whereas the actual UI now sends
   JSON. Browser tests bypass the Swift request-size guard. Global voice tests stub
   browser speech recognition; the new dictation tests inject an iOS-style adapter. Passing them does not establish native parity.

Google setup in the system browser, unavailable native browser push, and physical
camera/device checks remain documented platform limitations rather than new
main-branch regressions. The upload-size defect remains outstanding; voice and camera scope are addressed.
