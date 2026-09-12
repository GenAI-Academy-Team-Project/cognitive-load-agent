# Carestead iOS pilot

A Capacitor/Vite client for the existing Carestead backend. Web and mobile import
the same responsive dashboard from `web/components/care-dashboard.tsx`, including
all workspace views, dialogs, and account controls. See
[the parity audit](../docs/web-mobile-parity.md) for coverage and platform limits.

This is a pilot project, not a signed App Store release. The client bundle and
browser integration are tested. Compiling the Swift adapter, device session
persistence, and real Google authorization must be verified in full Xcode/on a
device before distributing the app. The development machine used to create this
pilot had Apple Command Line Tools but no full Xcode installation.

## What is reused

| Existing source | Mobile use |
| --- | --- |
| `web/components/care-dashboard.tsx` | Full responsive workspace and navigation |
| `web/components/recovery-form.tsx` | Password and email recovery screens |
| `web/components/auth-form.tsx` | Sign-in, sign-up, invitation enrollment, and guest access |
| `web/components/care-chat.tsx` | Scoped chat, evidence, and approval-gated actions |
| `web/components/care-calendar.tsx` | Appointments, proposals, review, and confirmation |
| `web/components/ui/` and `web/app/globals.css` | Controls and Carestead's visual styles |
| `web/lib/types.ts`, `web/lib/calendar-types.ts` | Shared API types |
| Existing hosted `/api/*` routes | Authentication, authorization, care rules, consent, data, and integrations |

Imports read those files directly; they are not copied into a second app source
tree. The mobile bundle has a separate entry point and dependencies/lockfile.
A Vite alias provides local link navigation. Both clients use the same DST-aware
calendar utilities; their error class and integration types are client-safe.
The build rejects server modules entering the mobile bundle. Database credentials
and integration secrets stay with the backend.

Shared source changes intentionally affect both products. Before changing shared
components, run both the web checks and the mobile checks. Each lockfile controls
its own installed versions; update shared React/UI dependency versions together
when intentionally upgrading them.

## Use your backend running on your Mac

Yes: the iPhone app can use the current Mac deployment and its existing database.
It does not require a Workers production deployment.

```text
iPhone app ── HTTPS ──> tunnel ──> mobile gateway :8081 ──> existing Mac backend :8080
```

The current `compose.local.yaml` binds the backend to `127.0.0.1:8080` by default.
That address is reachable on the Mac, but `localhost` on a physical phone refers
to the phone. The HTTPS tunnel makes the Mac server reachable without changing
that binding or enabling insecure HTTP in the native application.

The gateway runs separately and only listens on Mac loopback. It accepts mutation
requests from the configured public origin, then translates them to the local
backend's origin. This avoids HTTPS-to-local-HTTP origin mismatches while keeping
the existing server checks intact. It retains HttpOnly cookies and adds Secure
for the public HTTPS connection. It does not bypass authentication or roles.

1. Start your existing backend using your usual root commands, if it is not
   already running. Verify `http://localhost:8080/api/health` on the Mac. If you
   selected another host port with `PORT`, use that in the mobile settings below.
2. With `cloudflared` installed, open a separate terminal and run:

   ```sh
   cloudflared tunnel --url http://127.0.0.1:8081
   ```

   Keep that terminal open. Copy the printed HTTPS `trycloudflare.com` address.
   This publishes a route to the local application; normal Carestead account
   checks still apply. Quick tunnels are intended for testing, and their address
   changes when recreated. For repeated pilot use, use a named tunnel with a
   stable hostname. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
3. From the repository root:

   ```sh
   cd mobile
   npm ci
   cp config.example.env .env.local
   ```

   Edit **only `mobile/.env.local`**:

   ```dotenv
   VITE_CARESTEAD_API_ORIGIN=https://YOUR-TUNNEL.trycloudflare.com
   VITE_CARESTEAD_LOCAL_BACKEND=1
   CARESTEAD_MAC_BACKEND_ORIGIN=http://127.0.0.1:8080
   CARESTEAD_DEV_API_ORIGIN=http://127.0.0.1:8080
   ```

   These are addresses, not secrets. Do not copy `web/.dev.vars` into the app.
4. In another terminal, from `mobile/`, run `npm run mac:gateway`. Leave it running.
5. On the iPhone, open the tunnel's `/api/health` URL in Safari to verify reachability.
6. From `mobile/`, run `npm run ios:prepare`, then `npm run ios:open`. In full Xcode,
   choose a signing team and a connected iPhone, then Run. The default bundle ID
   is `com.carestead.mobile`; choose an identifier owned by your team for distribution.

The Mac, backend, gateway, tunnel, and network must remain available. The phone
can reach a public HTTPS tunnel over Wi-Fi or cellular. If the tunnel URL changes,
update `.env.local`, prepare/rebuild the iOS app, and sign in again for the new
hostname. The gateway assumes the tunnel forwards the incoming Origin header.
An additional browser-interactive access login in front of the tunnel is not
integrated into the native API adapter.

**Google Calendar with a Mac backend:** connect Google from Carestead in the Mac
browser, using the same Carestead account as the phone and your existing local
OAuth configuration. Then tap Refresh in the mobile app. The saved connection
lives on the same backend, so mobile calendar actions can use it. Initial Google
setup through the temporary phone tunnel is deliberately redirected to these
instructions; it would require a matching public OAuth callback configuration.
No Google client secret or token-encryption key belongs in the mobile app.

## Use a production backend later

Set `VITE_CARESTEAD_API_ORIGIN` to its HTTPS origin and
`VITE_CARESTEAD_LOCAL_BACKEND=0`, then run `npm run ios:prepare` again. No mobile
gateway is needed. The endpoint is baked into the native config and web bundle;
changing it requires rebuilding/syncing both with `ios:prepare`.

Google setup opens the configured Carestead site in the system browser. Sign in
there with the same account, connect Google through the existing web flow, return
to the app, and Refresh. Browser and app sessions are separate. The pilot does
not attempt to transfer session cookies into the browser or run Google OAuth in
the embedded webview. [Google OAuth guidance](https://developers.google.com/identity/protocols/oauth2/native-app)

## Build, preview, and verify

```sh
cd mobile
npm ci
# Set .env.local first, using config.example.env as the template.
npm run dev             # Mac browser preview at http://127.0.0.1:5174
npm test                # Native transport contract and config tests
npm run test:e2e        # Isolated backend, mobile UI, and Mac gateway integration
npm run build           # Typecheck and package a standalone client bundle
npm run ios:prepare     # Build, sync assets, and register the native adapter
npm run ios:open        # Open Xcode; signing requires your Apple development setup
```

Browser development proxies `/api` to `CARESTEAD_DEV_API_ORIGIN` and uses ordinary
browser cookies. Keep this development server on loopback. `npm run preview`
serves packaged assets only; use `dev` for an authenticated browser preview.

The integration tests require the existing `web/node_modules` dependencies and
a Playwright Chromium installation. They start a fresh backend with
`CARESTEAD_TEST=1`, ephemeral D1 storage, and synthetic accounts on ports 43980/43981.
They never reuse the running Mac backend or send real external notifications.
Override `CARESTEAD_MOBILE_TEST_BACKEND_PORT` and `CARESTEAD_MOBILE_TEST_PORT` if
another process uses these ports. Chromium uses an iPhone viewport; these tests
do not establish Safari/WKWebView or native-device compatibility.

The Swift adapter uses URLSession's native cookie storage and does not send
cookies or response headers across its JavaScript bridge. It restricts requests
to the configured HTTPS origin and an explicit API path list, refuses redirects,
and does not automatically retry writes. Request cancellation suppresses late
JavaScript results; it cannot undo a server-side mutation already submitted.
The adapter must still be tested for sign-in, relaunch, expiry, and logout on iOS.

`scripts/prepare-ios.mjs` installs the Swift adapter into the generated
AppDelegate, registers its bridge controller in both the storyboard and scene
delegate, and adds voice permission descriptions. Edit the adapter template in
`scripts/CaresteadAPI.swift`, then run `ios:prepare`; do not edit the generated copy.
After that, build/run/archive through Xcode. See [Capacitor iOS workflow](https://capacitorjs.com/docs/basics/workflow).

## Preserve the existing project

Before a mobile work session:

```sh
cd mobile
node scripts/preservation.mjs snapshot
# Make mobile changes, then:
npm run check:preservation
```

This hashes tracked and untracked, nonignored files outside `mobile/` and reports
any changes or deletions. It does not hash secrets/ignored build output, and it
does not distinguish concurrent user edits from agent edits. It never restores
or overwrites files. During initial implementation it detected concurrent edits
outside `mobile/`; all edits made for this mobile implementation were confined
to this directory.

Existing web/Workers/Docker build commands remain independent. The existing
Dockerfile copies `web/`, so this mobile source is not compiled into the backend
image. Mobile dependencies and caches stay out of Git. No deployments or database
migrations are performed by the mobile scripts.

## Pilot scope and release work

The app includes the shared dashboard's planning and Care Ahead tools, recipient
and template management, responsibilities, handover and contacts, memory, chat,
calendar, care-circle controls, notifications, integrations, privacy, evaluations,
and account/recovery controls. Backend roles and consent still govern access.
iOS exports use a native share sheet; invitation URLs use the hosted origin.
It is online-first and does not queue offline writes or retain a local care-data
cache. Browser push is available through a supported browser or Home Screen web
app; it is not native iOS push.

Before distribution, validate native networking and cookie persistence, keyboard
and safe-area behavior, voice permissions, external calendar links, device
accessibility, and Google setup on real devices. Replace generated Capacitor
icon/splash assets, select signing identity and bundle ID, and supply appropriate
store metadata and privacy disclosures. In-app account
deletion, native push delivery acceptance testing, seamless OAuth/recovery return links, and offline sync are
separate follow-up work. Existing recipient deletion is not account deletion.
[Apple account deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app)

## OneSignal push

Native iOS push now has an optional OneSignal integration alongside existing
browser push. See [OneSignal rollout](../docs/notification-setup.md#onesignal-rollout)
for credentials, platform setup, opt-in, testing and rollback. No OneSignal
private key belongs in mobile environment files: the app obtains its public
App ID and private user alias from the authenticated backend on explicit opt-in.
Select an Apple signing team for both the app and notification extension before
building. Native delivery still requires an acceptance test on the configured
OneSignal app and signed device build.
