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

The app builds without Google credentials. Calendar stays in **setup pending** until the four runtime values are configured and an owner enables **Google Calendar** in **Account settings → Integrations**. No rebuild is needed when supplying or updating these secrets.

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

Open the deployed HTTPS app, sign in as an owner, and enable **Account settings → Integrations → Google Calendar**. Select a recipient and open **Calendar → Connect Google Calendar**. Complete Google's consent screen, choose an owned calendar, and use a test guest to verify create → reschedule → cancel, approving each action. A successful configuration upload does not connect a person's account or send an invitation; each caregiver completes that step in the app.

### Google Cloud and runtime values

1. In your Google Cloud project, enable the **Google Calendar API**.
2. Configure the OAuth consent screen and create an OAuth client of type **Web application**. Add your intended test users while the app is in testing.
3. Register the exact callback URL: `https://YOUR-CARESTEAD-HOST/api/calendar/callback`. For local development, register the exact localhost origin and port you use, followed by `/api/calendar/callback`.
4. Set these server-side Cloudflare Worker bindings, using your deployment's secret manager:

   | Binding | Where to find or generate it | Value to save |
   | --- | --- | --- |
   | `GOOGLE_CLIENT_ID` | In Google Cloud's **Google Auth Platform → Clients**, create or open your **Web application** OAuth client (older navigation: **APIs & Services → Credentials**). | Copy its Client ID. Use the same client for the secret and registered callback below. |
   | `GOOGLE_CLIENT_SECRET` | In that same OAuth client's details, copy the client secret when created, or create a replacement if the old value is unavailable. | Save the secret privately; it is not your Google account password or an API key. |
   | `GOOGLE_REDIRECT_URI` | Construct it from the URL where you open this Carestead deployment, then register it in that client's **Authorized redirect URIs**. | `https://YOUR-CARESTEAD-HOST/api/calendar/callback`, including any actual local port. Save the exact same URI in Carestead. |
   | `GOOGLE_TOKEN_KEY` | Generate locally once with `openssl rand -hex 32`; Google does not issue this key. | Save the generated 64 hexadecimal characters in your private configuration and secret manager; reuse them for this database. |

   Generate the encryption key with `openssl rand -hex 32`. Keep it in the secret manager. Changing this key without migrating stored ciphertext requires reconnecting accounts.

   For local development, use an ignored `web/.dev.vars` file containing these four bindings. Do not place credentials in client variables, source control, browser storage, or chat. The deployed Worker needs the same bindings independently of the local file.

   For the Docker preview, run `make local-init`, edit `web/.dev.vars`, set a callback such as `https://YOUR-LOCAL-HOST:PORT/api/calendar/callback`, register that exact URI with Google, and run `make up`. Compose reads the private host file and passes credentials through the container environment at runtime, outside the image. Run `make up` again after editing settings. Use the trusted local HTTPS setup in [deployment.md](deployment.md). Google permits HTTP callbacks for localhost, but not for a custom hostname used for development. Keep the browser origin, `AUTH_PUBLIC_URL`, and callback origin aligned; production preflight requires HTTPS.

5. Apply the repository's full database migration flow, including Calendar and subsequent integration migrations. Development bootstrap also creates the new tables. Use one schema initialization path for a fresh database; migrations and development bootstrap are not interchangeable migration-history systems.
6. Start Carestead, sign in as an owner and enable **Account settings → Integrations → Google Calendar**, then choose a recipient, open **Calendar**, select **Connect Google Calendar**, grant permissions, then choose an owned calendar. Setup remains pending while credentials are incomplete or the integration is off. Each caregiver connects their own Google account.

Requested scopes:

- `openid` and `email`: identify the connected Google account independently of the Carestead sign-in account.
- `https://www.googleapis.com/auth/calendar.events.owned`: create and manage events on calendars the account owns.
- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`: list calendars for explicit selection.

Google's permissions cover more events than the UI exposes. Carestead only manages event IDs it has linked to a recipient, through the caregiver who connected that account. Public distribution may require Google's OAuth verification for the requested scopes. See [Google's OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## Troubleshooting

Start with **Account settings → Integrations → Google Calendar → Manage settings**.
Owners can supply credentials there through **Environment configuration**, once
[encrypted overrides](deployment.md#encrypted-integration-overrides) are configured.
A saved override takes precedence over the corresponding runtime binding.

| Symptom / error | Check and recovery |
| --- | --- |
| Setup pending / `calendar_not_configured` | Check all four effective Google values, the 64-hex-character token key, and the owner switch. Restart local runtime after binding edits; upload cloud secrets to the actual Worker. Configuration presence does not prove Google access. |
| Google `redirect_uri_mismatch` | Match scheme, hostname, port, and `/api/calendar/callback` exactly in the Google Web application client's authorized redirect URIs and `GOOGLE_REDIRECT_URI`. Check for a saved override. For local HTTPS, substitute your actual host and port in `https://YOUR-LOCAL-HOST:PORT/api/calendar/callback`; register production separately. |
| Google rejects a plain HTTP custom-host callback | Use the trusted HTTPS local setup. Google's HTTP exception is for localhost, not a custom development hostname. See [Google redirect URI rules](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation). |
| Access blocked / test user denied | Add the connecting Google account to the OAuth app's test users; check audience and Workspace administrator restrictions. Enable Calendar API in the same project as the client. |
| `oauth_session` / `oauth_state` / authorization expired | Sign in and start Connect again on the configured origin in the same browser. Do not reuse callback links or switch hosts mid-flow. State is single-use, bound to the session and recipient, and expires in ten minutes. |
| `oauth_exchange_failed` | Start a fresh connection. If it repeats, check that client ID/secret belong to the same Web application client and the callback matches; check effective overrides. |
| `oauth_missing_scope` | Reconnect and grant both requested Calendar permissions and offline access. If Google keeps omitting access, revoke the app grant in Google account settings, then connect again. |
| Reconnect required / `invalid_grant` | Reconnect the same Google account. Access may have been revoked or expired. External OAuth apps in Testing with these Calendar scopes receive refresh tokens that expire after seven days; see [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration). |
| Connection fails after key changes | Restore the original `GOOGLE_TOKEN_KEY` if available; otherwise reconnect accounts to encrypt new tokens. Separately, `INTEGRATION_CONFIG_KEY` must match the saved configuration overrides; see deployment recovery. Do not generate either key on every deployment. |
| No calendar offered / `calendar_required` | Choose a calendar owned by the connected Google account for this recipient. Shared calendars where you are only a writer are excluded. |
| `google_account_changed` / `account_changed` | Use the account that created the appointment. Disconnect the previous account before deliberately connecting a different identity; switching identities does not transfer appointment ownership. |
| `calendar_mismatch` | Select the original appointment calendar for this recipient before editing it. |
| Google denied access / `calendar_forbidden` | Check calendar ownership, API enablement, and granted scopes. Also check Carestead write role and active recipient consent. Reconnect if Google access changed. |
| `calendar_changed` / event conflict | Discard the stale proposal and prepare a fresh preview. If the event was removed or changed into an unsupported form, manage it in Google Calendar. |
| Uncertain result / `google_unavailable` after approval | Use **Retry / check result** on the same action to reconcile. An interrupted executing claim becomes retryable after two minutes. Do not prepare a replacement invitation, which could create a duplicate. |
| Guest did not receive or see the invitation | Check the confirmed event and guest address in Google, plus the guest's invitation settings and spam folder. Carestead requests guest notifications but does not guarantee acceptance or automatic calendar placement. |
| Missing table after deployment | Apply the full migration flow to the D1 database bound to this Worker. Do not mix development bootstrap and migration history or reset existing care data to fix setup. |

A successful setup check is: enable the integration, connect a test account,
select an owned calendar, create → reschedule → cancel with approval each time,
and verify the event and guest notifications in Google. Disconnect/reconnect
and test revoked access as described under [Validation](#validation).

Documentation checked against the implementation and linked provider guides on
2026-09-12. Report only sanitized error codes and timestamps, never OAuth callback
query strings, tokens, or client secrets.

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
