# Notification tools

External services are optional and start off. After adding credentials and
restarting the local app (or uploading cloud secrets), sign in as a care-circle
owner and open **Integrations**. Enable the services you want to use. Switches
are saved in D1 and apply to the whole care circle. Existing deployments also
start off until an owner enables them; saved connections and preferences remain.
Missing credentials keep a switch unavailable. Local tasks, trusted facts, chat,
and in-app notifications remain usable. These switches do not replace recipient
consent, Google account connection, delivery opt-in, or action approval.


Carestead exposes `send_notification` as a typed, approval-gated function tool. The deterministic chat planner and structured API use the same validation and execution path. It supports targeted in-app notices, Resend email, Twilio SMS, and standard Web Push with VAPID. No LLM service or messaging credentials are needed for in-app delivery.

## Use it

1. Open **Notifications → Your delivery preferences** for the selected care recipient. Each caregiver saves their own preferences. Email uses their care-circle account address; SMS uses the number they enter and attest they own. SMS number ownership is not verified by an OTP in this release.
2. Enable the desired channel. Push requires permission in a supported browser, HTTPS (localhost is allowed for development), and server VAPID keys. On iPhone/iPad, add Carestead to the Home Screen and open it there. One browser registration is stored per caregiver per care recipient; registering another browser replaces it.
3. Open **Ask Carestead** and enter one of:
   - `In-app me: Please review the care plan.`
   - `Email Maya: Please review the care plan.`
   - `SMS Maya: Please confirm you can help today.`
   - `Push me: There is a care update to review.`
4. Use an exact, unique active care-circle display name, member ID, or `me`. Review the channel, destination, title, and full message, then select **Approve**. Cancel sends nothing. External message bodies are the exact approved text, so use a generic message when care details should stay inside the app. Push notifications open the selected recipient after sign-in.
5. Check **Recent delivery attempts**. `posted` means in-app; `accepted` means a provider accepted the request, not that it was delivered or read. `failed` means a definite failure. `unknown`, or a lingering `sending` record after an interrupted request, requires checking the provider before preparing another send.

## Local configuration

Copy the desired settings from [web/.dev.vars.example](../web/.dev.vars.example) into ignored `web/.dev.vars`. Preserve existing calendar or memory settings. Configure only the channels you intend to use. Restart the server after changing bindings.

For Docker, mount the same ignored secrets file:

```sh
make up
```

For email, configure a verified sender/domain in Resend and set `RESEND_API_KEY` and `NOTIFICATION_EMAIL_FROM`. For SMS, configure a Twilio sender and set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` (E.164). Complete the provider's sender setup for your destination countries. Twilio trial accounts may restrict destinations. Provider opt-outs can reject further messages even while the local SMS preference remains enabled.

Generate VAPID keys once, from `web`:

```sh
npx web-push generate-vapid-keys --json
```

Store the resulting values as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` to your operator contact, such as `mailto:care@example.com`. Keep the private key secret. Rotating keys requires browser re-registration. Allowlisted browser push services are FCM, Mozilla, and Apple; other push service hosts are rejected.

## Production

Apply the D1 migrations using `make cloud-release`. Copy
`web/.secrets.cloudflare.example` to `web/.secrets.cloudflare` once, then fill in
complete email, SMS, or VAPID groups. Preserve any existing Calendar/memory values.
Run `make cloud-secrets-check`, then `make cloud-secrets-apply` after deployment.
The same commands cover all integrations; no feature-specific environment file
is needed. Blank groups preserve existing remote settings.

See [deployment settings](deployment.md#where-settings-and-secrets-belong).
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

1. Install the ntfy app on your phone.
2. Set `NTFY_SERVER_URL=https://ntfy.sh` in `web/.dev.vars`, or use your own
   HTTPS ntfy server origin (no topic path). Optionally set `NTFY_ACCESS_TOKEN`
   to a publisher access token. For cloud, use `web/.secrets.cloudflare` and the
   existing secrets check/apply commands.
3. Rebuild local Docker with `make up`. For cloud, run `make cloud-release` to
   apply the ntfy preferences migration and deploy, then apply your secrets.
4. An owner enables **Integrations → ntfy mobile notifications**.
5. In the phone app, subscribe to a topic on the same server. In Carestead,
   open **Notifications → ntfy mobile push**, enter that topic, and enable it.
6. Ask `ntfy me: There is a care update to review.` Review and approve the
   message, then verify receipt on the phone.

Use an access-controlled topic for care details. Public topics are readable by
anyone who knows their name; a publisher token alone does not make a topic private.
Every subscriber with access receives the message. Topic ownership is not verified
when saving. Configure subscription credentials in the phone app when needed.
For self-hosted iPhone delivery, follow ntfy's upstream server setup instructions.

This channel uses ntfy for mobile push. It requires no browser subscription or
VAPID keys. It is on-demand, with approval for each message and no automatic
retries. `accepted` means the server accepted the message, not confirmed phone
receipt. Topic names and access tokens are excluded from previews, delivery
history and exports. Disabling removes the saved topic; changing the topic blocks
old approvals. Changing the server requires saving a topic again. Recipient
deletion removes ntfy preferences. Already sent messages cannot be recalled.

References: [ntfy publishing API](https://docs.ntfy.sh/publish/),
[phone subscriptions](https://docs.ntfy.sh/subscribe/phone/),
[self-hosted iOS push](https://docs.ntfy.sh/config/#ios-instant-notifications).
