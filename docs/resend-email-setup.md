# Email delivery (Resend) setup

Configure the service as a care-circle owner, then have each receiving caregiver
save their preferences for the selected care recipient. All sends require review
and approval. **Credentials configured** does not verify provider access.

Use [local configuration](notification-setup.md#local-configuration),
[cloud configuration](notification-setup.md#production), or encrypted overrides
under **Manage settings → Environment configuration** (see
[override setup and recovery](deployment.md#encrypted-integration-overrides)).
After configuring, switch the integration on separately.

## Where to find the configuration values

| Variable | Where to find or create it | What to use |
| --- | --- | --- |
| `RESEND_API_KEY` | In the Resend dashboard, open **API Keys → Create API Key**, name it for this deployment, and grant sending access to the intended domain. | Copy the secret at creation time into your private configuration. Resend does not show the key value again; create a replacement if you did not save it. |
| `NOTIFICATION_EMAIL_FROM` | Open **Domains**, add your domain, and complete the requested DNS verification. Then choose a sender address on that verified domain. | An address such as `updates@YOUR-VERIFIED-DOMAIN`, optionally with display name `Carestead <updates@YOUR-VERIFIED-DOMAIN>`. This is an address you choose, not another generated API key. |

See [Resend API key management](https://resend.com/docs/dashboard/api-keys/introduction)
and [domain verification](https://resend.com/docs/dashboard/domains/introduction).
The receiving address is the caregiver's Carestead account email; it is separate
from the configured sender.

## Setup and receipt check

1. Add a domain you control in Resend, publish the DNS records it requests, and
   wait for verification. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Set `RESEND_API_KEY` with permission to send from that domain and
   `NOTIFICATION_EMAIL_FROM`, for example `Carestead <updates@YOUR-VERIFIED-DOMAIN>`.
   Use local/cloud configuration or saved overrides.
3. The owner switches **Email delivery** on. Each receiving caregiver opens
   **Manage settings**, checks **Email me at**, and selects **Save email preferences**.
   The destination is their Carestead account email for the selected care recipient.
4. Ask `Email me: Please review the care plan.`, review and approve once,
   then check the inbox and **Notifications → Recent delivery attempts**.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| `channel_disabled` / wrong destination | The receiving caregiver must save email opt-in for the selected recipient. Check the account address shown in settings; chat cannot supply an arbitrary address. |
| Provider rejects the sender | Confirm domain verification completed and the From address matches the verified domain. Check the API key's permissions and the Resend request log. |
| Test sender cannot send to another caregiver | Resend's test domain restricts destinations; configure your own verified domain for care-circle delivery. See [Resend test email restrictions](https://resend.com/docs/dashboard/emails/send-test-emails). |
| `accepted` but no email | Check Resend's email status, recipient spelling, spam/junk, and any bounce or suppression in the provider dashboard. Acceptance is not inbox delivery. |
| Editing environment credentials has no effect | Check each field's source under Environment configuration for an override, then follow [override recovery](deployment.md#encrypted-integration-overrides). |

For HTTP failures or uncertain sends, see [shared troubleshooting](notification-setup.md#shared-troubleshooting).

See [shared troubleshooting](notification-setup.md#shared-troubleshooting) for
consent, changed destinations, and uncertain sends. Never repeat an ambiguous
send before checking provider history and the receiving device.

Checked against the implementation and linked provider guides on 2026-09-12.
