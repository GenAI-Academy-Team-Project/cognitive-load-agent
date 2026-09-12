# Google Calendar setup

External services are optional and start off. After adding credentials and
restarting the local app (or uploading cloud secrets), sign in as a care-circle
owner and open **Integrations**. Enable the services you want to use. Switches
are saved in D1 and apply to the whole care circle. Existing deployments also
start off until an owner enables them; saved connections and preferences remain.
Missing credentials keep a switch unavailable. Local tasks, trusted facts, chat,
and in-app notifications remain usable. These switches do not replace recipient
consent, Google account connection, delivery opt-in, or action approval.


Carestead supports connecting each caregiver's Google account, selecting an owned calendar for each care recipient, and preparing create/reschedule/cancel actions. A caregiver must review and approve each action before Carestead calls Google. Google sends guest notifications through Calendar (`sendUpdates=all`); Gmail inbox access is not requested.

## Configure the deployment

### Activation commands (configuration can be added when deploying)

The app builds without Google credentials. Calendar stays in **setup pending** until the four runtime secrets are configured. No rebuild is needed when supplying or updating these secrets.

**Cloud deployment from your machine**

1. Complete the Google Cloud setup below, including enabling Calendar API and registering the exact callback URL for the deployed app.
2. Copy `web/.secrets.cloudflare.example` to `web/.secrets.cloudflare` if it does not exist. Fill in all four Google values in that ignored file, preserving other integration settings. Generate `GOOGLE_TOKEN_KEY` once with `openssl rand -hex 32` and save it in your secret manager; reuse it on subsequent deployments.
3. From the repository root, run:

   ```sh
   make cloud-secrets-check  # Local validation only; prints no values
   make cloud-release        # Validate, migrate, and publish; see deployment.md
   make cloud-secrets-apply  # Upload configured runtime secrets to that Worker
   ```

   Use the same `CLOUDFLARE_WORKER_NAME` and D1 settings throughout. If the Worker is already deployed, generate the correct target with `make cloud-config`, then run `make cloud-secrets-check` and `make cloud-secrets-apply` only. The upload command regenerates `web/wrangler.deploy.json` from your cloud settings; it does not rebuild or migrate the database.

   The activation script accepts exported environment variables as well; these take precedence over the optional local file. It validates the client ID, exact HTTPS callback path, and encryption-key format. Secret values are passed to Wrangler through stdin and are never written into the generated Worker config or command arguments. It deliberately suppresses provider output that could expose credentials. On an upload failure, check Cloudflare authentication, permissions, and the selected Worker's settings in the dashboard before retrying.

**GitHub Actions deployment**

1. Configure the existing Cloudflare deployment secrets and D1 variables described in [deployment.md](deployment.md).
2. Add all four `GOOGLE_*` values from the table below as secrets in the GitHub **production** environment.
3. Run **Actions → Deploy Cloudflare → Run workflow**, with **Upload configured runtime secrets after deployment** checked.

The workflow validates the Calendar configuration before migrations or deployment, then uploads the secrets after publishing the Worker. Leave the checkbox unchecked for ordinary deployments that should retain the existing Calendar settings. Never replace `GOOGLE_TOKEN_KEY` with a new random value on every run.

**After activation**

Open the deployed HTTPS app, sign in, select a recipient, and open **Calendar → Connect Google Calendar**. Complete Google's consent screen, choose an owned calendar, and use a test guest to verify create → reschedule → cancel, approving each action. A successful configuration upload does not connect a person's account or send an invitation; each caregiver completes that step in the app.

### Google Cloud and runtime values

1. In your Google Cloud project, enable the **Google Calendar API**.
2. Configure the OAuth consent screen and create an OAuth client of type **Web application**. Add your intended test users while the app is in testing.
3. Register the exact callback URL: `https://YOUR-CARESTEAD-HOST/api/calendar/callback`. For local development, register the exact localhost origin and port you use, followed by `/api/calendar/callback`.
4. Set these server-side Cloudflare Worker bindings, using your deployment's secret manager:

   | Binding | Value |
   | --- | --- |
   | `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
   | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
   | `GOOGLE_REDIRECT_URI` | Exact registered callback URL |
   | `GOOGLE_TOKEN_KEY` | A random 32-byte key encoded as 64 hexadecimal characters |

   Generate the encryption key with `openssl rand -hex 32`. Keep it in the secret manager. Changing this key without migrating stored ciphertext requires reconnecting accounts.

   For local development, use an ignored `web/.dev.vars` file containing these four bindings. Do not place credentials in client variables, source control, browser storage, or chat. The deployed Worker needs the same bindings independently of the local file.

   For the Docker preview, run `make local-init`, edit `web/.dev.vars`, set a callback such as `http://localhost:3000/api/calendar/callback`, register that exact URI with Google, and run `make up`. The Compose file mounts the credentials read-only at runtime, outside the image. Production preflight intentionally requires HTTPS; it is not used for this local preview.

5. Apply the repository's database migration flow (new migration: `web/drizzle/0008_useful_next_avengers.sql`). Development bootstrap also creates the new tables. Use one schema initialization path for a fresh database; migrations and development bootstrap are not interchangeable migration-history systems.
6. Start Carestead, choose a recipient, open **Calendar**, select **Connect Google Calendar**, grant permissions, then choose an owned calendar. The UI shows setup pending until all four bindings are present.

Requested scopes:

- `openid` and `email`: identify the connected Google account independently of the Carestead sign-in account.
- `https://www.googleapis.com/auth/calendar.events.owned`: create and manage events on calendars the account owns.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: list calendars for explicit selection.

Google's permissions cover more events than the UI exposes. Carestead only manages event IDs it has linked to a recipient, through the caregiver who connected that account. Public distribution may require Google's OAuth verification for the requested scopes. See [Google's OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## Product behavior

- Use **Schedule appointment** to create a new responsibility or link an existing active responsibility. Supply explicit start/end times and an IANA time zone, up to 20 guest email addresses, location, and an optional organizer reminder.
- **Review invitation** saves a pending proposal. The preview shows the care recipient, organizer account, selected calendar, title, times, location, and guest list. **Approve and send invite** performs the external write.
- **Reschedule** reads the current Google event and prepares a time change. **Cancel appointment** first prepares a cancellation preview. Neither sends anything until approval. Both notify the event's current guests after approval.
- Cancellation reopens the linked responsibility for follow-up; it does not delete the care task. Mark it complete or archive it when appropriate.
- Google event links appear only after confirmation. Events created through Carestead use private visibility, hide the guest list from guests, and do not automatically copy clinical notes. Guests can still see the invitation content and apply their own reminders.
- Google invitations do not guarantee that a guest accepts or that the event automatically appears on their calendar. Calendar settings and guest responses still apply.
- Each recipient's calendar selector is a separate authorization to use that caregiver's account for the recipient. To change an older appointment, select the same calendar on which it was created.
- The agenda contains Carestead-linked appointments and the last confirmed data. It is not an import of all Google events or background two-way sync. Preparing a change fetches the latest event and guest list; approval refuses to overwrite a subsequent Google edit.
- Internal task date editing and chat rescheduling cannot bypass the Calendar approval path for linked appointments. Chat directs caregivers to Calendar for these external changes.

## Security and recovery

- OAuth state is random, hashed, single-use, expires after ten minutes, and is tied to the current Carestead session, member, and recipient. The code exchange uses PKCE.
- Refresh tokens are encrypted using AES-GCM with member-bound additional authenticated data. Access tokens exist only for the current server request. Tokens are excluded from recipient exports and monitoring.
- All mutations check origin, session, recipient membership, write role, active consent, and rate limits. Approval rechecks the connected account and selected calendar.
- An atomic action claim prevents concurrent execution. Google create requests use a stable event ID; create/update requests carry a private action marker. A retry first checks the existing Google result. Update/delete requests use the preview's ETag so a stale proposal cannot overwrite another edit.
- A lost response or interrupted local commit is shown as uncertain. Use **Retry / check result** to reconcile the same action. An interrupted executing claim can be retried after two minutes. Do not create a replacement invitation to recover the original action.
- A Google edit conflict requires discarding the proposal and reviewing a new one. Revoked or expired access requires reconnection.
- Disconnect deletes Carestead's saved credentials and calendar selections for that member; Google events remain. Users can revoke the Google-side grant in their Google account's third-party access settings. Reconnecting the same Google identity preserves ownership of linked appointments.
- Recipient exports include appointments and action history without credentials. Recipient deletion removes calendar bindings, actions, event links, and outstanding OAuth state. It does not delete events or invitations already delivered to Google; those must be explicitly cancelled first. Account credentials are member-level and may still serve other recipients.
- Retention removes completed/discarded action history and cancelled appointment records after the configured interval. Active event links and unresolved actions remain operational records until resolved or recipient deletion, so recovery and cancellation remain possible.

## Validation

Run from `web`:

```sh
npx tsc --noEmit --incremental false
npm run lint
npm run test:accessibility
npm run build
```

Calendar service tests execute production SQL against SQLite and mock only Google's HTTP responses. They cover approval-only writes, concurrency, duplicate prevention after a lost response, rescheduling, cancellation, stale ETags, recipient/member boundaries, token encryption, and daylight-saving transitions. Browser tests cover the setup state, invitation preview/approval, confirmed links, and accessibility.

A real-account acceptance test is still required after credentials are configured: connect a designated test account, create an event inviting a test guest, verify guest notification, reschedule, cancel, disconnect/reconnect, and revoke Google access to verify the reconnect state. Do not use a patient's real details for this test.

## Deferred features

Gmail email extraction, Meet links, free/busy suggestions, recurrence, RSVP display, shared-calendar access management, and background synchronization remain future milestones.
