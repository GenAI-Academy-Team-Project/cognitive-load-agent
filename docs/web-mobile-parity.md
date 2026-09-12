# Web and mobile parity audit

Reviewed September 12, 2026 against the working tree, including existing uncommitted work.

The original mobile pilot exposed task completion, a read-only handover, chat,
and calendar. Most web features were missing or linked out to a separate browser
session. Web and mobile now import `web/components/care-dashboard.tsx`; web's page
is a route wrapper and mobile supplies native export and hosted-link adapters.
This removes the separate feature implementation that caused those gaps.

| Feature | Result |
| --- | --- |
| Sign-in/up, invited enrollment, guest preview, sign-out | Shared authentication UI and backend; guest restrictions now match web |
| Password changes and recovery screens | Shared forms; all corresponding auth APIs allowed by native transport |
| Recipient selection and creation | Shared selector and creation/customization dialog |
| Plans and templates | Shared creation, cloning, saving, upgrading and custom categories |
| Responsibilities | Shared create/edit/reassign/complete/archive, filtering and pagination |
| Overview, risk review and approvals | Shared dashboard, care check and explicit approval dialog |
| Care Organizer and Care Ahead | Shared forecasts, recurring care, preferences, what-if, availability, coverage and reviewed update workflows |
| Handover and contacts | Shared profile/contact editing, brief copy and since-away acknowledgement |
| Memory | Shared trusted facts, verification, archiving and conflicts; chat memory controls reused |
| Chat and optional assistance | Shared recipient context, tools, evidence and planning-review navigation |
| Calendar | Shared proposal/review/confirmation/history; same DST validation in both clients |
| Care circle | Shared invitations, renewals, roles and removal; API authorization retained |
| Notifications | Shared composer, approvals, inbox categories, read/dismiss/restore, preferences and delivery history |
| Integrations | Shared per-provider status and owner controls |
| Privacy | Shared consent, retention, recipient deletion and export; native export uses iOS share sheet |
| Timeline and evaluations | Shared activity log and demo evaluation views |
| Navigation and layout | Same responsive workspace; mobile retains safe-area and touch sizing |

Native JavaScript and Swift allowlists now include planning, notifications,
integrations, exports and password changes. They retain same-origin restrictions,
GET/POST limits, native cookie ownership, cancellation checks and redirect refusal.
Invitation links use the configured hosted origin instead of `capacitor://localhost`.
The native adapter template and checked-in AppDelegate are synchronized.

## Remaining platform differences and validation limits

- Browser push registration is not supported inside the native app. The control
  detects capability and explains how to use a supported browser.
  Native APNs delivery is still unimplemented. Other configured delivery channels
  use the shared backend and preferences.
- Initial Google connection uses the system browser and a separate browser login;
  Mac-backed setups connect from the Mac. Return to mobile and refresh. Seamless
  OAuth return links are not implemented.
- Recovery screens work in mobile, but emailed recovery links open the hosted
  site; automatic return to the app is not implemented.
- Native exports have a share-sheet implementation with temporary-file cleanup,
  but successful file saving and cancellation must be checked on a real device.
- Clipboard, voice, external links, keyboard/safe areas, session persistence after
  relaunch and native accessibility require device validation. Browser tests with
  an iPhone viewport do not prove WKWebView compatibility.
- Neither client provides offline write synchronization or account deletion.
  Recipient deletion is a different existing feature. The mobile app retains an
  offline notice and refresh-on-resume behavior.
- The repository contains an iOS project, not an Android project. This audit does
  not establish Android support.

## Regression coverage

`mobile/tests/parity.spec.ts` navigates all workspace views at an iPhone viewport,
checks horizontal overflow, applies a reviewed planning update, saves delivery
preferences and changes a password against an isolated real backend.
`pilot.spec.ts` covers invited sign-up, completion, scoped chat, recipient switching,
calendar and sign-out/sign-in. Pagination and Mac gateway tests remain included.
Transport tests compare the JS and Swift API lists and adapter source, in addition
to request restrictions, cancellation, session expiry and calendar handoff.

Web regression coverage includes account settings, role permissions, templates,
planning, handover, cross-session coverage and calendar/date handling. Builds must
pass for both projects; the mobile bundle's server-import guard must stay enabled.
Swift syntax checking is not a full Xcode build or device test.

The audit also fixed a narrow-screen handover grid overflow that displaced the
floating chat button, and overlapping search/filter controls. Mobile overflow
assertions compare `scrollWidth` to `documentElement.clientWidth`; `innerWidth`
can expand with overflowing content and conceal this defect.

Validation performed:

- Web and mobile production builds and TypeScript checks passed. Mobile used
  `https://carestead.test` as a build-only origin; no deployment configuration was
  written. Rebuild with the real backend origin before installing the app.
- Mobile transport/config tests: 9 passed.
- Mobile browser/backend/gateway tests: 4 passed.
- Web account/template/planning/calendar regression run: 23 passed (including setup).
- Web list/planning regression run after layout fixes: 19 passed (including setup).
- Swift adapter syntax parse passed; no full Xcode/device validation was performed.

Existing uncommitted changes were preserved. Other working-tree edits continued
during the audit; shared imports incorporated those changes into both builds.
