# Twilio SMS setup

Configure the service as a care-circle owner, then have each receiving caregiver
save their preferences for the selected care recipient. All sends require review
and approval. **Credentials configured** does not verify provider access.

Use [local configuration](notification-setup.md#local-configuration),
[cloud configuration](notification-setup.md#production), or encrypted overrides
under **Manage settings → Environment configuration** (see
[override setup and recovery](deployment.md#encrypted-integration-overrides)).
After configuring, switch the integration on separately.

## Where to find the configuration values

| Variable | Where to find it | What to use |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Open the Twilio Console for the account/subaccount that owns the sender; find **Account SID** in its account credentials. | The Account SID, which starts with `AC`. An API Key SID is not interchangeable in this implementation. |
| `TWILIO_AUTH_TOKEN` | Reveal that same account's **Auth Token** in the Console account credentials. | The account Auth Token, not an API key secret. Use live account credentials for an actual receipt test; test credentials do not deliver SMS. |
| `TWILIO_FROM_NUMBER` | For the current trial, open **Messaging → SMS → Try out SMS** and use its sender for your test recipient. For a purchased sender, open the account's **Phone Numbers → Manage → Active numbers** and select an SMS-capable number. | The sender number in E.164 format, including `+` and country code. It must belong to the credentialed account. |

See [Twilio Auth Tokens](https://www.twilio.com/docs/iam/api/authtoken) and
[trial sender setup](https://www.twilio.com/docs/usage/trials/try-out-sms).
Copy values privately into the matching configuration fields; do not paste them
into this guide. The receiving caregiver's number belongs in **SMS preferences**,
not in `TWILIO_FROM_NUMBER`.

## Setup and receipt check

1. In Twilio, identify the SMS sender for the account and destination you are testing.
   Complete the provider's sender setup for your destination countries. For the
   current trial flow, use the trial console's sender and a verified US recipient;
   upgrading changes the available sending options. See [Twilio trial SMS](https://www.twilio.com/docs/usage/trials/try-out-sms).
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`
   (E.164, with `+` and country code) using local/cloud configuration or saved overrides.
3. The owner switches **Twilio SMS** on. The receiving caregiver opens its
   **Manage settings**, enters their own phone number, checks the consent box,
   and selects **Save SMS preferences** for the chosen care recipient.
4. Ask `SMS me: Please confirm you can help today.`, review and approve once,
   then check both the phone and **Notifications → Recent delivery attempts**.

**SMS trial limitation:** this build hardcodes the message body to support delivery
with Twilio trial accounts. Any information entered in the SMS message is replaced
by the default template content sent to the phone; the composed message is not
delivered by SMS. Every outgoing SMS sets
`Body=sms_appointment_reminders` in [notification-service.ts](../web/lib/notification-service.ts).
Twilio's trial delivers its template; the composed title/detail stays in the
in-app copy. This also applies when paid credentials are configured: upgrading
alone does not restore custom text. A code change and validation are required
before using SMS for the exact composed message.

## Troubleshooting

| Symptom / delivery code | Check and recovery |
| --- | --- |
| Preference cannot be enabled / `channel_disabled` | Owner enables the integration first; the receiving caregiver saves their number and opt-in for this recipient. Saving another person's preferences is not supported. |
| `twilio_21211` | Check the receiving number and country code; use a different number from the sender. |
| `twilio_21606` | Confirm the sender belongs to the configured Twilio account and supports SMS; check the trial console's sender for this test. |
| `twilio_21608` | Verify the receiving number in Twilio and check the account's trial destination restrictions. Carestead's ownership checkbox does not perform Twilio verification. |
| `twilio_21610` | The recipient opted out with the provider. They must choose to resubscribe through the provider's supported flow; toggling Carestead's checkbox does not clear that opt-out. |
| `provider_http_400` or another `twilio_*` code | Inspect the matching request in Twilio's messaging logs for its specific rejection. Check sender setup, destination restrictions, and remaining trial allowance there. |
| Phone receives an appointment template instead of the preview | This is the fixed trial body described above, not a stale draft. |
| `accepted` but no SMS | Inspect Twilio's message status and the receiving device. Carestead does not ingest delivery or opt-out webhooks. |

For ambiguous results, follow [shared troubleshooting](notification-setup.md#shared-troubleshooting)
before sending again. Carestead's SMS ownership attestation has no OTP verification.

See [shared troubleshooting](notification-setup.md#shared-troubleshooting) for
consent, changed destinations, and uncertain sends. Never repeat an ambiguous
send before checking provider history and the receiving device.

Checked against the implementation and linked provider guides on 2026-09-12.
