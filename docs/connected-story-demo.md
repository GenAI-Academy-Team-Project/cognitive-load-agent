# Maya and Alex: one connected cloud demo

Maya receives Alex’s physiotherapy appointment image. Carestead turns it into reviewed responsibilities, catches Maya’s scheduling conflict, helps her choose a workable time, sends the approved calendar invitation and caregiver updates, then carries that same decision into the handover and mobile voice answer.

Deployment: **https://carestead.carestead.workers.dev**. Sign in as **matvxhmt@gmail.com**, playing Maya. Calendar guest: **deventhusiast.ailearningsupport@gmail.com**. Use the existing account; no fabricated email addresses, phone numbers, Google tokens, or push subscriptions are seeded.

## Two caregivers, one handoff

Maya (`matvxhmt@gmail.com`) coordinates. The seed adds **Noah** (`deventhusiast.ailearningsupport@gmail.com`) as a second caregiver, reusing their existing account/display name if present. Noah is also the calendar guest. The private run sheet includes an invitation link if registration is needed. Accept it once in a second browser profile; later seeds reuse that account and grant access to the new Alex.

In **Receiving caregiver**, Maya is marked **(you)**. Selecting Noah shows **Caregiver handoff: Maya → Noah** before sending. Selecting Maya explicitly says it is an update to yourself. Sending a notification does not reassign the ride or establish that Noah accepted a responsibility.

For the handoff, send to Noah’s **Carestead inbox**, then open the new Alex in Noah’s browser/mobile session and review Notifications, Handover, and voice. Noah must enable his own email, SMS, browser push, and ntfy preferences for external delivery to him; Maya’s phone/subscription settings are never copied onto Noah. The five-channel readiness check covers the signed-in seed owner and separately verifies that Noah has accepted membership. It does not certify Noah’s external channels. Both caregiver accounts survive recipient cleanup.

## Prepare once

From `web/`:

```sh
npm run demo:login
```

Sign in in the Chrome window. This stores an ignored, private session for this deployment. It does not reuse your local development login. Node 22.13+ and Google Chrome are required.

In the app, keep one persistent setup recipient with your real integration preferences. Configure and enable the model, Google Calendar, email, SMS, browser push, and ntfy integrations. Connect Google and choose the calendar. Enable Maya’s email and SMS preferences, save her real test phone number, and subscribe the phone to the chosen ntfy topic. The seed copies those recipient-scoped preferences into each fresh Alex. Other profiles and settings are preserved.

Browser push needs a real subscription from the browser/device you will show. Enable it on the deployed site, then in that browser’s developer console copy:

```js
JSON.stringify((await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.toJSON())
```

Save the JSON (not the surrounding copied string quotes) in `web/.playwright-runs/story-push.json`, and set:

```sh
export DEMO_PUSH_SUBSCRIPTION_FILE="$PWD/.playwright-runs/story-push.json"
```

This private capability is reused automatically on each seed. If it expires, or VAPID keys change, subscribe again. Alternatively enable browser push on each fresh Alex in Notifications, then run `demo:check`. Device permission and Google OAuth consent require initial human interaction; data creation and removal do not require SQL or manual task entry.

The source recipient defaults to the selected persistent recipient on the first seed and is saved for subsequent takes. Set `DEMO_SOURCE_RECIPIENT_ID` if you want to choose it explicitly. Do not use disposable Alex as the source.

## Start every take clean

```sh
npm run demo:seed
```

This first cleans the previous owned take, then creates a fresh **Alex (story demo …)** with just one **October 20, 2026, 3–4 PM home-care visit**, assigned to your account, and recorded availability from 8 AM–6 PM. It adds Alex’s short mobility/communication context and the synthetic Lakeside contact. No physiotherapy appointment, extracted tasks, Google event, notification, or completed outcome is pre-created in this default mode.

It copies your supplied [appointment image](samples/physiotherapy-appointment-intake.png) to the ignored run folder and prints the path to a run sheet with the new recipient link. Use that link on desktop and mobile; old links belong to deleted takes. It checks the real Google binding, model configuration, and **all five** notification channels. Missing configuration returns a nonzero exit with instructions; the recoverable demo manifest remains available. After enabling missing recipient preferences run:

```sh
npm run demo:check
```

Checks do not send messages. `check.json` records settings readiness and available delivery outcomes; it is not a guarantee of provider delivery. Complete one off-camera rehearsal and inspect the actual email, SMS, browser, ntfy, inbox, and guest-calendar results before recording.

## Follow the connected buttons

The generated run sheet opens **Review a document** directly for the new Alex. After approving intake, each newly created responsibility has **Review schedule conflicts**. Choose the appointment; the Calendar review keeps its actual task ID selected.

**Review schedule conflicts → Save details and check time → Suggest workable options → Review this option → Approve care-plan change → Schedule this responsibility → Review invitation → Approve and send invite → Prepare caregiver update → Review notification delivery → Continue to handover → Ask about this handover.**

The conflict calendar shows the current day and proposed day side by side, highlighting overlapping responsibilities for the same caregiver. It also appears in What if, with **Continue to calendar review**. Set the extracted appointment’s caregiver to Maya and confirm its duration; the seed does not fabricate assignment from the image. No menu switching is needed for these handoffs. The recipient and actual appointment remain the context throughout.

These UI additions need to be deployed before using the new navigation on the cloud site. The default seed still creates only the conflicting home-care visit, Maya’s availability, and brief recipient/contact context. The image supplies the appointment and preparation tasks live.

## The connected feature story

| Stage | Show and do | Say |
| --- | --- | --- |
| Recipient workspace | Open the new Alex. Point to the navigation without opening every page. | “Everything here belongs to Alex: his overview, care plan, care circle, responsibilities, organizer, calendar, timeline, and handover.” |
| Overview / Care Plan / Care Circle | Briefly show Alex’s mobility context, personalized mobility plan, Maya’s membership, and Lakeside contact. | “Maya coordinates Alex’s care. He needs transport to appointments, and she prefers one clear update when plans change.” |
| Image intake | Care Organizer → document/image review → upload the supplied PNG. Review the actual extracted fields. | “Maya receives this appointment image. Carestead extracts the appointment, clinic contact, confirmation reminder, and transport preparation. Maya reviews before adding anything.” |
| Responsibilities | Approve the reviewed intake. Assign the tasks to Maya. Keep confirmation open. | “The image becomes owned responsibilities, not just text in a message.” |
| Conflict | For the unlinked physiotherapy task, use Care Organizer’s conflict options or What if preview. Record its duration as 60 minutes and assign Maya. Preview October 20 at 3 PM. | “Maya already has Alex’s home-care visit at three. The planner checks recorded availability and responsibilities before offering an alternative.” |
| Transport / alternative | Add the actual 30-minute ride at 2:30 PM if needed, assign Maya, and set **Moves with** to physiotherapy. Choose a returned alternative that passes the preview checks. Confirm the actual ride time moves with it and approve the in-app move. If no option is feasible, extend recorded availability and request options again. | “This option fits the recorded availability and moves the linked ride. Maya reviews both changes before applying them.” |
| Calendar / approval | Open **Schedule / manage calendar** on physiotherapy. Use the newly saved appointment start/end in **America/Toronto**, with the reviewed location. Add guest **deventhusiast.ailearningsupport@gmail.com**. Review and approve the invitation. | “Maya approves the calendar invitation. Google confirms the event and sends the guest update.” |
| All notifications | From the confirmed calendar action, prepare a caregiver handoff to Noah. Select his enabled channels. For the five-channel transport demonstration, Maya’s own configured channels can be tested separately and labeled as a self-update. Review and approve each channel’s draft. Check delivery attempts and actual devices. | “The same approved decision becomes a caregiver update across the enabled channels. The delivery records show what each provider accepted or failed.” |
| Timeline | Show the intake, responsibility changes, and calendar outcome; use Notifications for channel delivery records. | “The history connects the source, Maya’s decisions, and the resulting actions.” |
| Handover | Generate/refresh the brief. Point to the scheduled appointment, transport owner, open clinic confirmation, and Lakeside contact. | “The next caregiver gets the current situation without rebuilding it from messages and calendar entries.” |
| Mobile voice | Sign in as Noah on the same deployed backend and choose this Alex. Ask: **“What changed for Alex, and what do I need to do next?”** | “The same authorized care context is available by voice on mobile.” |

## Follow outputs through the workflow

Treat each result as the input to the next screen. Wording, draft count, option ordering, and summary structure can vary with the LLM. Judge each step by saved state and provenance:

| Result you receive | What carries forward | Continue when |
| --- | --- | --- |
| Image extraction | Reviewed appointment fields, preparation tasks, contact and uncertainty | Maya has corrected omissions or errors against the image and approved the selected items. Review/verify extracted facts separately if the planner requires verified evidence; intake approval alone leaves facts as review_due. Do not depend on a specific extracted title or item order. |
| Saved intake | The actual appointment task selected in Responsibilities | It has an owner, duration, and the intended Toronto date/time. Add or correct missing transport details through normal review. |
| Conflict suggestions | Whichever offered alternative Maya selects | The deterministic preview reports no unresolved conflicts and the dependent ride is sensible. LLM rationale alone is insufficient. |
| Applied plan | The persisted appointment and ride times | Responsibilities shows the approved values; use those values in Calendar. |
| Google action | Confirmed appointment and its actual guest list | The action succeeds. An uncertain result goes through Retry / check result; it is not a cue to continue with a success claim. |
| Notification composer | A draft based on that confirmed action | Maya checks recipient, channels, and factual content, then approves. Inspect each channel’s outcome separately. |
| Handover | Current recipient records, including outstanding tasks | The generated brief agrees with the saved state. Correct the underlying records or regenerate if it omits something needed for the demo. |
| Voice | The same recipient and current authorized context | The answer explains the actual change and next action. There is no required sentence to match. |

For narration, use “this appointment,” “the selected alternative,” “the updated pickup,” and “these remaining tasks.” Point to the returned values on screen. Never describe an absent field or failed action merely because the script expected it. A natural follow-up such as “What still needs confirmation?” is preferable to rerunning a prompt until it produces prescribed wording.

**Image facts to preserve:** physiotherapy October 20 at 3 PM; clinic phone **555-0108** (synthetic, do not call); call the clinic **October 18**; arrange transportation **October 19 at 6 PM**; appointment time still needs confirmation. The arrangement reminder is separate from the appointment-day ride. Do not attach the preparation reminder as a ride dependency or mark clinic confirmation complete simply because Google accepted the event.

The current app generates conflict alternatives in **Care Organizer**. Calendar handles Google scheduling and linked reschedule approvals. The live-intake path therefore has an in-app planning approval followed by a calendar invitation approval. Do not narrate this as an automatic Calendar conflict agent or personal Google free/busy lookup.

Example caregiver message structure, after the event succeeds. Use the confirmed action’s actual date, time, owner, and remaining tasks; do not paste these placeholders literally:

> Alex’s physiotherapy is scheduled for [confirmed date/time] at [reviewed location]. [Assigned caregiver] owns the [saved pickup time] ride. Arrange transportation by October 19 at 6 PM. Clinic confirmation is still outstanding; call Lakeside on October 18. Please review the updated plan.

Expected voice answer must reflect actual saved state. Do not require it to claim “the care circle has been notified” if deliveries failed or approval has not happened. A provider’s “accepted” result does not establish device receipt or reading. Using Maya on mobile shows continuity across devices; a different incoming caregiver needs a real account with access to this Alex.

## Short recording / preloaded alternative

The full workflow with five channel deliveries is better rehearsed over several minutes. For 90 seconds, use the script’s permitted preloaded variant:

```sh
npm run demo:seed -- --preload
```

This creates five responsibilities: appointment, ride, clinic confirmation, transport arrangement, and the conflicting home-care visit. It validates the 3 PM conflict and the 1 PM alternative through the planner, creates a real **guest-free 3 PM baseline Google event**, then leaves a **1 PM reschedule proposal with your guest** pending. The actual ride moves to 12:30 PM on approval. Preparation reminders keep their original dates.

Show image extraction as a review of the source; **do not approve a duplicate intake**. Say “I’ve prepared the appointment and a proposed change.” Then use Calendar’s pending linked reschedule approval live, followed by notifications, handover, and voice. This is a rescheduling demonstration, not a first-time schedule demonstration. No notification or completed handover claim is fabricated by seeding.

## End a take and repeat

Because your appointment includes a real guest, first in Carestead:

1. Open this Alex’s Calendar → appointment → **Cancel appointment**.
2. Review **Guests receiving updates**, including `deventhusiast.ailearningsupport@gmail.com`.
3. Approve cancellation and wait for Google’s confirmed result. This sends a cancellation update to the guest.
4. Run one of:

```sh
npm run demo:clean  # finish without creating another take
npm run demo:seed   # delete the old take and prepare a fresh live-intake take
```

Cleanup rejects pending proposals, cancels eligible seed-owned guest-free events, and deletes only the manifest-owned Alex through the normal API. Guest-bearing events, uncertain Google writes, renamed profiles, unknown appointments, or ownership mismatches stop cleanup. Live-intake appointments must be cancelled in the app before cleanup even if no guests were added, since they were created during the demo rather than by the seed.

The account, Google connection, other recipients, and source notification preferences stay intact. Sent emails, SMS, device notifications, and guest invitations cannot be recalled; historical provider records and application deletion audits may remain. The next Alex starts with fresh recipient-scoped history. Recipient deletion is rate-limited to three attempts per hour; the shared API helper waits and retries explicit throttling, but never blindly replays ambiguous network failures.

Keep the ignored manifest. If a process is killed, inspect whether it is still running before removing the printed run folder’s `operation.lock`. If creation succeeded but its HTTP response was lost, inspect the dedicated Alex in the app rather than repeatedly creating replacements.

## Known delivery limitation

The repository currently sends the fixed Twilio trial body **`sms_appointment_reminders`**, not the reviewed notification text (`web/lib/notification-service.ts`). SMS transport may work while failing to demonstrate the care summary’s content. Verify your Twilio account’s supported content and test-number restrictions before changing that existing trial behavior. The demo check calls out this limitation; it cannot certify SMS content fidelity.

Use `npm run test:demo` for the local ownership, cleanup, retry, date, and channel-readiness checks. A successful local test run does not certify the cloud deployment, model extraction quality, Google authorization, or external delivery.
