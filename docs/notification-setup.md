# Notification setup

External services are optional and start off. After adding credentials and
restarting the local app (or uploading cloud secrets), sign in as a care-circle
owner and open **Integrations**. Enable the services you want to use. Switches
are saved in D1 and apply to the whole care circle. Existing deployments also
start off until an owner enables them; saved connections and preferences remain.
Missing credentials keep a switch unavailable. Local tasks, trusted facts, chat,
and in-app notifications remain usable. These switches do not replace recipient
consent, Google account connection, delivery opt-in, or action approval.


Carestead exposes `send_notification` as a typed, approval-gated function tool. The deterministic chat planner and structured API use the same validation and execution path. It supports targeted in-app notices, Resend email, Twilio SMS, and standard Web Push with VAPID. No LLM service or messaging credentials are needed for in-app delivery.

## Choose an integration

Each guide includes provider setup, a receipt check, and troubleshooting:

- [Mobile push (ntfy)](ntfy-setup.md)
- [Twilio SMS](twilio-sms-setup.md)
- [Email delivery (Resend)](resend-email-setup.md)
- [Browser push (VAPID)](browser-push-setup.md)
- [Google Calendar](google-calendar-setup.md)

An owner first configures and enables the service under **Account settings →
Integrations → Manage settings**. Each receiving caregiver then saves their own
preferences for the selected care recipient. **On · credentials configured**
checks configuration presence, not provider authentication or actual delivery.
Owners can use **Environment configuration** for encrypted overrides; see
[override setup and recovery](deployment.md#encrypted-integration-overrides).
Saving configuration does not turn the service on.

## Where to save configuration values

All examples in these guides are placeholders or public provider URLs. Substitute
your own values privately; never add real keys, tokens, phone numbers, or deployment
configuration to the documentation.

| Configuration path | Where to enter values | Apply the change |
| --- | --- | --- |
| Local development / Docker | Use the tracked `web/.dev.vars.example` as a list of names; enter values in ignored `web/.dev.vars`, preserving existing settings. | Restart `make dev`, or run `make up` again for Docker. |
| Cloud Worker from your machine | Enter complete integration groups in ignored `web/.secrets.cloudflare`, starting from `.secrets.cloudflare.example` if needed. | Run `make cloud-secrets-check`, then `make cloud-secrets-apply` for the intended deployed Worker. Deploy/migrate first if this is a new installation. |
| GitHub deployment | Add the same variable names as secrets in the repository's **production** environment. | Run the Cloudflare deployment workflow with its runtime secret upload option enabled. |
| Carestead owner UI | Open **Account settings → Integrations → Manage settings → Environment configuration** and enter values in the named fields. | Select **Save configuration**, then turn on the integration. Saved overrides take precedence over runtime values. |

The owner UI requires `INTEGRATION_CONFIG_KEY` on the server first. For local use,
`make local-init` generates it without replacing an existing key. For a new cloud
setup, generate a separate key privately with `openssl rand -hex 32`, save the
64-character output in the cloud secret store, and keep it stable. Do not paste
the literal command into a configuration field. This key is not issued by any
provider and cannot be set in the integration UI. See
[encrypted override setup and recovery](deployment.md#encrypted-integration-overrides).

## Use it

1. Open **Account settings → Integrations** for the selected care recipient. Each caregiver saves their own preferences. Email uses their care-circle account address; SMS uses the number they enter and attest they own. SMS number ownership is not verified by an OTP in this release.
2. Enable the desired channel. Push requires permission in a supported browser, HTTPS (localhost is allowed for development), and server VAPID keys. On iPhone/iPad, add Carestead to the Home Screen and open it there. One browser registration is stored per caregiver per care recipient; registering another browser replaces it.
3. Open **Ask Carestead** and enter one of:
   - `In-app me: Please review the care plan.`
   - `Email Maya: Please review the care plan.`
   - `SMS Maya: Please confirm you can help today.`
   - `Push me: There is a care update to review.`
4. Use an exact, unique active care-circle display name, member ID, or `me`. Review the channel, destination, title, and full message, then select **Approve**. Cancel sends nothing. Email and push carry the approved content, so use a generic message when care details should stay inside the app. SMS currently uses a fixed trial template instead; see [Twilio SMS](twilio-sms-setup.md). Push notifications open the selected recipient after sign-in.
5. Check **Recent delivery attempts**. `posted` means in-app; `accepted` means a provider accepted the request, not that it was delivered or read. `failed` means a definite failure. `unknown`, or a lingering `sending` record after an interrupted request, requires checking the provider before preparing another send.

## Local configuration

Copy the desired settings from [web/.dev.vars.example](../web/.dev.vars.example) into ignored `web/.dev.vars`. Preserve existing calendar or memory settings. Configure only the channels you intend to use. Restart the server after changing bindings.

For Docker, Compose reads the same ignored secrets file into the container environment at runtime. Recreate the running service after changes:

```sh
make up
```

Follow the channel-specific setup below for required values. Direct local development
uses `make dev`; restart it after editing bindings. Docker uses `make up` again.
Do not put secrets into the image or commit the ignored files.

## Twilio SMS

See the dedicated [Twilio SMS setup and troubleshooting guide](twilio-sms-setup.md).

## Email delivery (Resend)

See the dedicated [Email delivery (Resend) setup and troubleshooting guide](resend-email-setup.md).

## Browser push (VAPID)

See the dedicated [Browser push (VAPID) setup and troubleshooting guide](browser-push-setup.md).

## Production

Apply the D1 migrations using `make cloud-release`. Copy
`web/.secrets.cloudflare.example` to `web/.secrets.cloudflare` once, then fill in
complete email, SMS, or VAPID groups. Preserve any existing Calendar/memory values.
Run `make cloud-secrets-check`, then `make cloud-secrets-apply` after deployment.
The same commands cover all integrations; no feature-specific environment file
is needed. Blank groups preserve existing remote settings.

See [deployment settings](deployment.md#configuration).
The VAPID public key is intentionally sent to the browser; private credentials
remain server-side. Serve the app over HTTPS, including `/carestead-sw.js` and
`/manifest.webmanifest`.

## Function-tool contract

`GET /api/chat?recipientId=...` returns the function definition in `tools` and the configured channel names in `notificationChannels`. The definition lives in [web/lib/notification-types.ts](../web/lib/notification-types.ts). A future model-backed planner can return this function's arguments; the server must route them to the proposal endpoint, never directly to a provider.

An authenticated owner/caregiver can prepare the same tool using:

```json
{
  "action": "propose_notification",
  "recipientId": "recipient-alex",
  "notification": {
    "channel": "email",
    "memberId": "the-care-circle-member-id",
    "title": "Caregiver update",
    "detail": "Please review the care plan."
  }
}
```

POST that JSON to `/api/chat` with the session cookie and same-origin request. The response includes a pending action card. Approval uses the existing `{ "action": "approve_action", "recipientId": "...", "actionId": "..." }` contract. The server reads the saved payload, rechecks access, recipient consent, channel configuration and opt-in, and rejects changed destinations. Clients cannot supply arbitrary email addresses, SMS numbers, or push endpoints as tool destinations.

`GET /api/notifications?recipientId=...` returns the current caregiver's settings and delivery attempts sent by or addressed to them. POST supports `save_preferences`, `subscribe_push`, and `disable_push`; preferences can only be changed for the authenticated caregiver. Push subscriptions are not exposed through chat or export.

## Delivery guarantees and limits

- A unique durable action claim prevents repeat or simultaneous approvals from sending twice. Resend also receives the action ID as its idempotency key. Notification execution shares the existing care-data lease with consent changes and deletion.
- This is on-demand tool execution, not a background scheduler. There are no automatic reminders, retry workers, escalation rules, provider delivery webhooks, email read tracking, quiet hours, or digests yet. Failed or ambiguous attempts are never silently retried. A manually prepared new action can send another message, so check uncertain results first.
- Delivery history records sanitized error codes and provider IDs. API acceptance is not treated as confirmed delivery. An in-app copy remains available to the addressed caregiver even if external delivery fails.
- Read state is now per caregiver. Existing shared inbox entries remain visible to the care circle; targeted tool entries are visible only to their addressed caregiver. Legacy shared read timestamps are not copied to individual caregivers.
- Recipient export includes delivery records, preference metadata and read receipts, excluding push endpoint/key material. Retention removes old attempts and reads with notification history. Recipient deletion removes the new scoped records; already sent messages remain with external providers/devices. Disabling a channel cannot recall an in-flight or previously accepted message.

## Validation

```sh
make test-notifications
cd web
npx playwright test tests/notifications.spec.ts tests/chat.spec.ts
```

The service suite uses synthetic destinations and mocked providers; no real message is sent. Before rollout, perform an opted-in acceptance test for each configured provider and device: approve a generic message, verify actual receipt, open the push link, disable the channel, and confirm a stale approval cannot send. SMS ownership verification and signed provider status/opt-out webhooks are follow-up work before broad enrollment.

Provider references: [Resend send API](https://resend.com/docs/api-reference/emails/send-email), [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource), [Web Push library](https://github.com/web-push-libs/web-push), [Apple Web Push support](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers?language=objc).

## ntfy mobile push

See the dedicated [ntfy mobile push setup and troubleshooting guide](ntfy-setup.md).

## Shared troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Switch unavailable / Credentials required | Sign in as an owner and supply the complete credential group. ntfy's access token is optional. Reload after restarting local runtime or uploading cloud secrets. |
| Configuration saved but channel unavailable | Turn the integration on separately. Then have the receiving caregiver opt in for the selected recipient. Credentials configured does not test the provider. |
| Settings fail to load / changed environment value is ignored | Check [encrypted override recovery](deployment.md#encrypted-integration-overrides), including the original encryption key and field source. |
| `consent_inactive` / access denied | Check active recipient consent and active care-circle membership. An owner/caregiver must prepare and approve the action. |
| `notification_target_changed` | The saved destination or target name changed after the preview. Prepare and review a fresh notification. |
| `provider_http_401` / `provider_http_403` | Inspect provider credentials, permissions, and sender configuration; check saved overrides as well as environment values. |
| `provider_http_429` | Check the provider's quota/rate limit and request log before preparing a new send after the restriction clears. There is no automatic retry. |
| `unknown`, `provider_result_unknown`, HTTP 408/5xx, or a lingering `sending` | A timeout, provider failure, or interrupted request may have happened after acceptance. Check provider logs/history and the receiving device first. Do not blindly create another action. |
| `notification_already_attempted` | The action has already claimed a delivery attempt. Re-approving it cannot resend; inspect the original result before deciding whether a new action is appropriate. |

To report a problem, record the channel, time, sanitized error code, action/provider
ID when available, and runtime (local or cloud). Do not share secret values,
OAuth callback query strings, push subscriptions, or private topic names.

Documentation checked against the repository implementation and linked provider
guides on 2026-09-12. Provider dashboards and trial terms may change.
