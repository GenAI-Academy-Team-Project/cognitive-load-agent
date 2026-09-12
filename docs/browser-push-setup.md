# Browser push (VAPID) setup

Configure the service as a care-circle owner, then have each receiving caregiver
save their preferences for the selected care recipient. All sends require review
and approval. **Credentials configured** does not verify provider access.

Use [local configuration](notification-setup.md#local-configuration),
[cloud configuration](notification-setup.md#production), or encrypted overrides
under **Manage settings → Environment configuration** (see
[override setup and recovery](deployment.md#encrypted-integration-overrides)).
After configuring, switch the integration on separately.

## Where to generate the configuration values

| Variable | Where to find or generate it | What to use |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY` | Run `npx web-push generate-vapid-keys --json` from `web` once. | Copy the output's `publicKey` string into this variable. This part is intentionally shared with browsers. |
| `VAPID_PRIVATE_KEY` | Use the same command's output from the same run. | Copy its `privateKey` string into private server configuration. Keep the pair together; do not generate these two fields separately. |
| `VAPID_SUBJECT` | Choose a contact URI for the operator of this deployment. | A `mailto:` address you control, such as `mailto:operator@example.com`, or an HTTPS contact URL. This value is chosen, not generated. |

The [Web Push CLI](https://github.com/web-push-libs/web-push#command-line)
prints a newly generated key pair. Run it privately, save the values in your secret
manager, and reuse them on subsequent deployments. The browser creates its own
subscription when the caregiver selects **Enable on this browser**; do not copy
browser endpoints or subscription keys into these environment variables.

## Setup and receipt check

1. From `web`, generate a key pair once:

   ```sh
   npx web-push generate-vapid-keys --json
   ```

2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (an operator
   contact such as `mailto:care@example.com`) using local/cloud configuration or
   saved overrides. Keep the private key secret and reuse the pair across deployments.
3. Serve Carestead over trusted HTTPS, including `/carestead-sw.js` and
   `/manifest.webmanifest`. Localhost is allowed for development; a custom local
   hostname requires trusted HTTPS. Use your configured HTTPS host and port.
4. The owner switches **Browser push** on. On the receiving device, open
   **Manage settings → Enable on this browser** and grant notification permission.
   On iPhone/iPad, install Carestead on the Home Screen and open it from there.
   See [Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
5. Ask `Push me: There is a care update to review.`, approve once, verify receipt,
   and tap the notification to check that it opens the recipient after sign-in.

One registration is stored per caregiver per care recipient. Enabling another
browser replaces the previous registration. Supported push service hosts are
FCM, Mozilla, and Apple. Mobile push through ntfy is a separate integration and
needs no VAPID keys.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| Permission denied / no permission prompt | Allow notifications in browser site settings and device settings, then select Enable on this browser again. Use the Home Screen app on iPhone/iPad. |
| Registration fails on local preview | Use the trusted HTTPS origin; check certificate trust and that the service worker and manifest load on that same origin. Custom-host HTTP is not the localhost exception. |
| `invalid_push` | Use a supported browser push service; malformed subscriptions or other endpoint hosts are rejected. Register from the intended browser. |
| Failure after rotating VAPID keys | Keep the public/private pair together. Remove the old browser push subscription/site data, sign in again, and enable push for each recipient. The app may reuse an existing browser subscription, so only toggling Disable push may not replace the old key. |
| `provider_configuration_invalid` | Check the matching VAPID pair and subject in the effective configuration, including saved overrides. |
| `provider_http_404` / `provider_http_410` | The push endpoint expired. Carestead clears the saved registration after this response; register the browser again. |
| One device stopped receiving | Registering another browser replaces this caregiver/recipient's registration. Also check device notification settings. |
| `push_message_too_large` | Shorten the message; encoded push content must fit the service's size limit. |
| `accepted` but no alert | Check OS notification settings, Focus/Do Not Disturb, and the currently registered browser. Acceptance does not confirm display. |

See [shared troubleshooting](notification-setup.md#shared-troubleshooting) for
consent, changed destinations, and uncertain sends. Never repeat an ambiguous
send before checking provider history and the receiving device.

Checked against the implementation and linked provider guides on 2026-09-12.
