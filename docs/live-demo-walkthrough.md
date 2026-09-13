# Earlier in-app coordination rehearsal

**For the current Google-integrated, 1:45 recording, use [Calendar demo setup and speaker script](calendar-demo-recording.md).** It uses your existing login and includes clean seeding, sign-in, Google Calendar, notifications and Evaluations. The sequence below is the earlier in-app-only alternative.

Prepared in the existing app at https://carestead.com:8083. All scenario data is synthetic. This is the in-app scheduling demo; the separate Alex Google Calendar proposal is unchanged and unsent.

## Open the right recipient

Sign in with your existing account. Choose **Alex (coordination demo)** in the recipient selector, or open:

https://carestead.com:8083/?view=Responsibilities&recipientId=c232de2c-ac72-4552-b0c1-c4c9bdfe1748

Date: **Monday, September 14, 2026**. All displayed times are **America/Toronto**.

| Record | Starting time | Demo result |
| --- | --- | --- |
| Alex physiotherapy appointment | 10:00 AM, 60 minutes | 2:00 PM |
| Drive Alex to physiotherapy | 9:30 AM, 30 minutes; Noah assigned | 1:30 PM |

The ride's **Moves with** dependency points to the appointment. Both caregivers have recorded availability from 8 AM to 6 PM. Both have acknowledged the starting handover. Rescheduling changes task details, so previous coverage acceptance must not be described as confirmation of the new time.

## Before recording

1. Keep the recipient link above bookmarked. Start your recording at sign-in, with credentials already entered.
2. Open a separate browser profile or private window for Noah. His synthetic credentials are in `web/.playwright-runs/live-demo/noah-login.local.txt` (local, ignored by Git). Sign in there and open the same recipient's Notifications view: https://carestead.com:8083/?view=Notifications&recipientId=c232de2c-ac72-4552-b0c1-c4c9bdfe1748
3. Keep Noah's window ready in the background. Do not acknowledge another handover until the demo is finished.
4. A real **unsent notification draft** is already prepared for Noah in your Notifications view. Use that draft after applying the schedule changes. Only Carestead inbox is selected; no external notification will be sent by that draft.
5. The rehearsal's applied planning proposal may still be visible. Use the new proposal's enabled **Approve and apply** button during the demo.

## Exact clicks and narration

| Time | Click / enter | Say |
| --- | --- | --- |
| 0:00–0:05 | Click **Sign in**. Select **Alex (coordination demo)**. | “I sign in to coordinate Alex's care.” |
| 0:05–0:17 | Click **Responsibilities**. Point to **Alex physiotherapy appointment** and **Drive Alex to physiotherapy**. | “Alex's appointment needs to move. That also affects the ride and the people helping with care.” |
| 0:17–0:30 | Click **Ask Carestead**. A response to **What needs attention today?** is already saved. Expand **Evidence used**. If needed, enter that question and click the arrow **Send message**. Press Escape to close chat. | “Carestead answers from Alex's stored care records, with evidence I can inspect.” |
| 0:30–0:55 | Click **Care Organizer**, then **What if?**. In **Responsibility to move**, choose **Alex physiotherapy appointment**. Under **Try this time**, enter **September 14, 2026, 2:00 PM**. Click **Preview the ripple effect**. | “The preview moves the linked ride too, keeping it thirty minutes before the appointment. It checks recorded availability and overlapping responsibilities.” |
| 0:55–1:12 | Confirm the two changes and **No conflicts found in the shared availability and responsibilities.** Click **Prepare changes for approval**. Scroll down to **Reviewable plans**, then click the new proposal's **Approve and apply**. Wait for **applied**. | “I review the exact changes before approving. The system rechecks the proposal before applying it.” |
| 1:12–1:25 | Click **Responsibilities**. Show appointment **2:00 PM** and ride **1:30 PM**. | “The saved appointment and ride now reflect the approved changes.” |
| 1:25–1:45 | Click the **bell icon** at the top. Find the prepared **Alex: appointment and ride updated** draft. Review Noah and **Carestead inbox**. Click **Approve and send** once. Switch to Noah's window and reload Notifications to show receipt. | “I review the caregiver update before sending it. Noah receives the revised details and can confirm whether the new ride time still works.” |
| 1:45–2:00 | In Noah's window click **Care Hand Over**. Show **2 changes since you were away**. Expand **View change details** for either task. | “Noah can see exactly what changed since his last handover. The next caregiver gets the current picture without rebuilding the story.” |

## Notification text (already drafted)

Receiving caregiver: **Noah**

Delivery channel: **Carestead inbox** only

Title: **Alex: appointment and ride updated**

Message:

> Alex’s physiotherapy on September 14 is now at 2:00 PM. The linked ride is now at 1:30 PM. Noah, please review the revised plan and confirm you can still cover the ride.

To create it manually: **bell icon → Send a notification → Receiving caregiver → Noah → Notification title → Message → Carestead inbox → Prepare notification → review → Approve and send**. Do not create a second draft if the prepared one is still present.

## Verification and repeat takes

The actual UI was exercised through evidence expansion, preview, approval, persisted task updates, Noah's two handover changes, and notification draft preparation. No notification was sent during verification. Starting task times and both handover checkpoints were restored afterward.

Screenshots and a verification report are in `web/.playwright-runs/live-demo/`.

For another take before September 14, restore only this synthetic scenario with:

```sh
cd web
node scripts/prepare-coordination-demo.mjs --reset-times
```

This restores the schedule and handover checkpoints, but preserves action history, chat and notification drafts/deliveries. It does not retract messages or clear sent notifications. After sending a draft, prepare a new one for the next take. These fixed dates must be refreshed for demonstrations after September 14.

## Google Calendar scope

This earlier sequence uses in-app responsibilities and does not update Google Calendar. The updated Calendar workflow now previews dependent responsibilities with the Google reschedule and applies the care changes after Google confirms. Use the linked recording guide above to demonstrate it.
