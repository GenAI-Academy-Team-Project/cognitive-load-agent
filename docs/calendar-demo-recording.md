# Carestead recording: 1 minute 45 seconds

**Story:** “One appointment changes. Carestead keeps the calendar, ride, caregiver update, and recorded outcome together—with approval before action.”

Use your existing Carestead login and its Google connection. The synthetic recipient is **Alex (calendar demo)**. All preparation below happens **before recording**. The optional handover ending stretches the recording to **2:00 maximum**.

## Your 30-minute recording plan

| Minutes | Do this | Finished when |
| --- | --- | --- |
| 0–5 | Start/check the existing app; sign in and check Google connection. | The app opens at the URL below and Calendar says Connected. |
| 5–10 | Save the script login, then run the clean seed. | Terminal prints **Ready: Alex (calendar demo)**. |
| 10–15 | Check the prepared proposal, voice permission, and script below. | You see both proposed time changes; microphone works. |
| 15–20 | Record the 1:45 sequence. | Evaluation screen is the final frame. |
| 20–27 | If needed, clean/reseed and record a second take. | A take you want to keep is saved. |
| 27–30 | Clean the demo data, then optionally stop the app. | Cleanup completes before the server stops. |

**Use two terminals:** Terminal A runs the app; Terminal B runs login/seed/cleanup. Keep the same app runtime throughout: switching between Docker and local development can select a different database. Do not rebuild between takes.

## 1. Start the current app — off camera

1. Open **https://carestead.com:8083** first. If your existing app opens with your account and Google connection, keep that app running. Skip startup commands and continue at step 4.
2. If you normally use local development and it is stopped, run these in **Terminal A**, leaving it open:

   ```sh
   cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent
   make dev
   ```

   Development builds the pages as you open them; a separate build is unnecessary. If you specifically want to validate a production build, run `make build` from the project root before starting. If dependencies are missing, run `make install` once first. This existing setup requires Node 22.13+ and installed Google Chrome for the login script.
3. **Only if Docker is your usual runtime**, use this instead of step 2:

   ```sh
   cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent
   make up
   ```

   This builds and starts Docker in the background. Wait for success. Do not run Docker and development on the same ports. If a port is occupied, use the already-running app or stop its original terminal/runtime first. Do not delete database volumes.
4. Open **https://carestead.com:8083** and sign in with **your existing email and password**.
5. Open **Account settings → Integrations**. Google Calendar must be enabled and configured. If setup is incomplete, follow [Google Calendar setup](google-calendar-setup.md).
6. Click the **Calendar icon** in the top bar. If needed, click **Connect Google Calendar**, use your existing Google account, and complete Google's consent screen. Select your calendar in **Calendar for [person]**.
7. Check that the Calendar panel says **Connected** and displays a selected calendar. Setup is not part of the recording. If setup is unavailable, the app disables the calendar actions and explains what is needed; it does not pretend that sample data updated Google.

## 2. Authorize the preload script — off camera

In **Terminal B**, paste:

```sh
cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent/web
node scripts/live-demo-login.mjs
```

1. A separate Chrome window opens at Carestead sign-in.
2. Enter **your existing Carestead email and password**. Use the same account that has Google Calendar connected.
3. Click **Sign in**. The window closes after saving your session locally.
4. The session is stored in the ignored `web/.playwright-runs/live-demo/owner-auth.json`. No replacement account is created and no Google credentials are copied into the script.

If the script reports an expired session later, repeat this step. You do not need to reconnect Google unless the app requests it.

## 3. Load a clean recording scenario — off camera

In the same `web` terminal:

```sh
node scripts/seed-calendar-demo.mjs --clean
```

For repeatable takes, use the command above without a fixed date. It chooses two calendar days ahead in Toronto, including across daylight-saving changes. All times in this script are Toronto time. Set your recording browser/computer to Toronto (Eastern Time) so the displayed times match the narration.

The script:

1. Checks your login, the updated app, Google connection, and selected calendar.
2. In clean mode, cancels only the previous seed-owned Google event and deletes only the recorded **Alex (calendar demo)** profile. It protects other patients and your account settings.
3. Creates a fresh **Alex (calendar demo)** under **your login**, using Mobility & Physiotherapy as the starting plan.
4. Adds a **10:00–11:00 AM physiotherapy appointment** and a **9:30–10:00 AM ride**, both assigned to your account for this rehearsal.
5. Links the ride through **Moves with**, records your synthetic availability from **8:00 AM–6:00 PM**, and saves one verified communication preference.
6. Creates one **real Google Calendar event** for the appointment, titled **Alex physiotherapy (Carestead demo)**, with **no guests**.
7. Saves your handover checkpoint and prepares a **2:00–3:00 PM reschedule proposal**. Its linked ride moves to **1:30–2:00 PM**. The proposal lists **deventhusiast.ailearningsupport@gmail.com** under **Guests receiving updates** and remains unapproved for the recording. The organizer/calendar stays **matvxhmt@gmail.com**. Google sends the guest update only after approval.
8. Leaves chat unanswered until you send a question and writes your date, account, calendar and current recipient links to **`web/.playwright-runs/live-demo/calendar-demo.local.md`**.

Wait for **Ready: Alex (calendar demo)**. Open the run-sheet file. Use its new link after every clean run; a fresh recipient has a fresh ID.

In your IDE, open **`web/.playwright-runs/live-demo/calendar-demo.local.md`**. This is the source of truth for this take's date and recipient URL; do not reuse a bookmarked URL from an earlier take.

Running the seed again without `--clean` retains an unused ready proposal. After a take, use `--clean` to get an empty history and fresh proposal. If you approved the guest-bearing reschedule, first open **Alex (calendar demo)** in Carestead Calendar, choose **Cancel appointment**, review **Guests receiving updates**, and approve cancellation only if you intend to notify those guests. Then run `--clean`. Both clean and reset stop for confirmed appointments with guests; reset is not a bypass. Sent external emails/SMS cannot be recalled; use **Carestead inbox** for repeatable recordings.

For repeated retakes that do not need an empty history, use `node scripts/seed-calendar-demo.mjs --reset`. This reuses the demo profile and returns its appointment to 10 AM before preparing the 2 PM proposal. Clean mode deletes a profile, which is limited to three attempts per hour. On HTTP 429, the scripts now print a wait time and retry automatically (up to twice); deletion may require an hour, while other actions generally require a minute. Keep the script running. If a previous clean run already cancelled the event before hitting the deletion limit, rerun `--clean` to finish that cleanup before preparing another take.

Clean mode deliberately stops if Google has an uncertain action, an event has acquired guests, or the dedicated profile was renamed. Resolve the named condition rather than deleting unrelated records. A Google outage cannot be made safe by silently substituting seed results.

## 4. Arrange the recording — off camera

1. Use a desktop browser at about **1440 × 960**, with the sidebar visible. Keep zoom at 90–100% and text readable.
2. Open the run-sheet Calendar link. Check **Connected**, the original **10 AM** appointment, and one pending **Reschedule appointment** proposal showing the appointment and ride changes. Do **not** approve it yet.
3. Click **Ask Carestead**. A newly prepared demo has no prewritten chat exchange. After you ask **What does Alex prefer?**, the answer should recall “Alex prefers one concise written update when appointment times change,” with its source under **Evidence used → Verified fact**.
4. In the same browser you will record, click the **microphone / Start voice input** button and allow microphone access. Say **What does Alex prefer?**, check the transcript, then click **Send message**. This checks real speech recognition before the take. Leave spoken replies off for the 1:45 recording so the app does not talk over your narration. If the microphone is disabled, use a supported browser; typing is a fallback and must not be described as a live voice demo. Raw audio is not stored by Carestead; the browser may use its vendor's speech service. Press Escape to close chat.
5. Keep the run sheet and this speaker script on another display or outside the recording area.
6. Click your **name/avatar at the top right → Log out** in the browser where you tested microphone access. If necessary, open **https://carestead.com:8083/sign-in**. Enter your existing email/password before starting; leave the password masked. Start recording immediately before clicking **Sign in**. Your email will be visible if the sign-in form is included; frame the capture according to your preference.
7. After sign-in, choose **Alex (calendar demo)** from the recipient selector. If the app selected another patient, choose the demo explicitly.

## 5. Record this 1:45 sequence

The proposal was prepared before recording. Say “I've prepared a change” so the audience understands why it is already available. Google setup and date entry are intentionally off camera; the real approval and result are on camera.

| Time | Exact UI action | Speaker script |
| --- | --- | --- |
| **0:00–0:06** | Click **Sign in**. In the top recipient selector, choose **Alex (calendar demo)**. | “I sign in to Alex's care plan, with responsibilities and care context together.” |
| **0:06–0:10** | Click **Care Plan** in the sidebar. Point to the personalized plan. | “Alex's personalized plan brings responsibilities together.” |
| **0:10–0:30** | Click **Ask Carestead → microphone / Start voice input**. Say **What does Alex prefer?** Wait for the transcript, then click **Send message**. Expand the latest **Evidence used → Verified fact**. Press **Escape**. | Speak the question into the microphone, then say: “That answer recalls Alex's saved, verified preference, with the source visible. I can ask by voice; Carestead keeps the text, not raw audio.” |
| **0:30–0:42** | Click the top-bar **Calendar icon**. Point to **Connected** and the selected calendar. Scroll to **Review before sending**. | “My Google Calendar is connected. I've prepared a change from ten to two; nothing has moved yet.” |
| **0:42–0:56** | In **Reschedule appointment**, show **Appointment and linked responsibilities**. Point to the appointment **10 AM → 2 PM** and ride **9:30 AM → 1:30 PM**. | “The preview includes the linked ride, keeping pickup thirty minutes before the appointment, with recorded availability and care requirements checked.” |
| **0:56–1:08** | Click **Approve change and notify guests** once. Wait for **Google Calendar and the care plan are updated**. Point to the updated **Care appointments** card. | “I approve the exact changes. Google confirms the update, and Carestead saves the revised appointment and ride.” |
| **1:08–1:30** | Scroll to **Confirmed actions**. On the newest reschedule, click **Prepare caregiver update**. In **Receiving caregiver**, select **your own display name**. Keep **Carestead inbox** checked. Review the prefilled title/message. Click **Prepare notification**, then the draft's **Approve and send**. | “The confirmed changes become a ready-to-review message. I choose the recipient and approve sending—to my own Carestead inbox for this demo.” |
| **1:30–1:45** | Open **Notifications** and briefly show the received care summary and **Recent delivery attempts**. Then click **Demo** in the sidebar, then **Evaluations**. Briefly show the benchmark cards, then scroll to the newest notification and **Caregiver-approved calendar action** records. Point to **Tool**, **Policy**, and **Outcome**. | “The tools, approvals, and outcomes are traceable. Synthetic benchmarks keep failures visible. One change, coordinated and recorded, with the caregiver in control.” |

**Two separate approvals:** **Approve change and notify guests** asks Google to send the calendar update to the guests shown in the proposal. After that succeeds, **Prepare caregiver update → Prepare notification → Approve and send** sends the care summary through your selected Carestead channels. For this demo, select your own name and **Carestead inbox** so you can show the received summary in **Notifications**. Google Calendar guest updates appear in **Recent delivery attempts**; they are not Carestead inbox messages. “Accepted” confirms the provider request, not receipt or reading.

This is roughly 200 spoken words with room for the clicks. Rehearse your pacing once. For a recording, trim loading pauses if needed, but do not replace an unconfirmed result with a success frame. If Google takes longer, use the remaining buffer up to two minutes.

## Optional 15-second ending — maximum 2:00

At **1:45**, click **Care Hand Over**. Show **2 changes since you were away** and expand **View change details**. Say:

> “The handover also shows exactly what changed. The next caregiver has the updated picture, and changed responsibilities still need their acceptance.”

Alternatives: use the extra time to show your received notification, or enable **Turn on spoken replies** before the voice question and pause narration while Carestead reads its answer. Choose one stretch feature, keeping the total at or below two minutes.

## Schedule, reschedule and cancel outside the timed recording

- From **Responsibilities**, click **Schedule / manage calendar** on a task. From **Overview → Upcoming care schedule**, click **Manage calendar**. Calendar opens with that responsibility selected.
- For an unlinked task, click **Schedule this responsibility**. Review **Link a responsibility**, **Event title**, **Time zone**, **Starts**, **Ends**, **Guest email addresses**, **Location**, and **Your reminder**. Click **Review invitation**, then **Approve and send invite** after reviewing.
- For a linked task, click **Reschedule**. Change **Starts time** and **Ends time** using the Hour / Minute / AM-PM selectors and **Done**. Click **Review change**. Inspect the appointment and dependent responsibilities, then approve.
- For cancellation, click **Cancel appointment** and review the cancellation proposal before **Approve cancellation and notify guests**. Cancellation does not automatically cancel transport or other dependent responsibilities; review those separately.
- From **Care Organizer → What if?**, choosing a Google-linked appointment shows **Manage in Calendar**. In-app-only planning remains available separately.
- If setup is missing, the Calendar screen explains which prerequisite is missing and disables calendar writes. In-app responsibilities remain usable.

## Feature alignment and honest claims

The main recording demonstrates the personalized plan, daily coordination, voice input, grounded chat, verified memory recall, dependency checks, approval-aware actions, Google integration, reviewed notifications, and evaluation traces. The optional ending demonstrates handover or spoken replies. It does not deeply demonstrate memory conflict resolution, cloning, consent withdrawal, or deletion.

Availability checks use recorded information for this recipient, not personal-calendar free/busy or travel-time prediction. A changed ride time is not confirmation that the caregiver has accepted it. The current planner is deterministic; this demo does not claim LLM reasoning or multiple agents.

## Repeat the recording

1. Stop recording.
2. From `web`, run **`node scripts/seed-calendar-demo.mjs --clean`**.
3. If authentication expired, run **`node scripts/live-demo-login.mjs`** and sign in, then rerun clean mode.
4. Reopen **`web/.playwright-runs/live-demo/calendar-demo.local.md`** and use its new recipient link.
5. Confirm the 10 AM appointment, 9:30 AM ride, and pending 2 PM proposal. Begin again at sign-in.

Your real patient records, email, Google connection, and account identity are not reset.

**Copy/paste reset for another take (app must still be running):**

```sh
cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent/web
node scripts/seed-calendar-demo.mjs --clean
```

Wait for Ready, reopen the generated run sheet, use its **new** link, and repeat section 4. Do not click approval during this check. Sign-in, voice, approval, notification sending, and evaluation are the only recorded actions; terminal setup is off camera.

## Finish: teardown without preparing another take

1. Stop and save the recording. **Leave the app running** while removing the demo.
2. In Terminal B, run:

   ```sh
   cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent/web
   node scripts/clean-calendar-demo.mjs
   ```

3. Wait for **Demo cleanup complete**. This cancels the seed-owned guest-free Google event and deletes its dedicated recipient. It does not create a replacement. The old run-sheet link is now obsolete.
4. If using local development, press **Ctrl+C in Terminal A**. If using Docker, run from the project root:

   ```sh
   cd /Users/maneettaantony/Workspaces/team-projects/cognitive-load-agent
   make down
   ```

5. To record another day, start the same app runtime, then run `seed-calendar-demo.mjs --clean` again. If your saved script session has expired, run the login script first. Keep the ignored local demo manifest: it identifies exactly which data cleanup owns. Never delete the database or use Docker volume removal as a demo reset.

## If something interrupts the take

| What you see | Exact next action |
| --- | --- |
| Login script/session expired | Run `node scripts/live-demo-login.mjs`, sign in with your existing account, then rerun the clean seed. |
| Connection refused / app does not open | Start the same runtime from section 1, then retry. |
| Google setup pending / reconnect required | Open **Account settings → Integrations** and **Calendar**, restore the existing Google connection and selected calendar, then rerun the seed. |
| Seed says the app lacks linked rescheduling | Restart development with the current source, or rebuild your existing Docker runtime with `make up`; then rerun seed. |
| Google update is uncertain or care save incomplete | Stop recording. In Calendar use **Retry / check result**, or **Review remaining changes** and review/approve the recovery. Wait for confirmed completion before clean/reseed. Do not repeatedly click approval or delete the profile. |
| Microphone permission or transcription fails | Fix and test it off camera. If you type the question instead, remove the claim that this take demonstrates live voice. |
| Clean mode reports guests, another appointment, or a renamed profile | Stop and inspect that specific record. Automated cleanup deliberately refuses to remove data it can no longer identify safely. |
| Recording runs long | Finish within the two-minute stretch or redo. Omit the optional handover; preserve the real approval/result. |

No script can guarantee success during expired authorization or a Google outage. The repeatable path preserves your login and connection, rebuilds only the dedicated scenario, and stops with an explicit reason when safe cleanup cannot finish.
