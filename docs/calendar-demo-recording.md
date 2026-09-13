# Carestead recording: 1 minute 45 seconds

**Story:** “One appointment changes. Carestead keeps the calendar, ride, caregiver update, and recorded outcome together—with approval before action.”

Use your existing Carestead login and its Google connection. The synthetic recipient is **Alex (calendar demo)**. All preparation below happens **before recording**. The optional handover ending stretches the recording to **2:00 maximum**.

## 1. Start the current app — off camera

1. Open the project in your terminal.
2. If your normal development app is already running, let it refresh with the latest code. Otherwise run `make dev` from the project root. Leave that terminal running.
3. If you use Docker instead, run `make up` from the project root to rebuild and start the current version. Do not run Docker and the development server on the same ports.
4. Open **https://carestead.com:8083** and sign in with **your existing email and password**.
5. Open **Account settings → Integrations**. Google Calendar must be enabled and configured. If setup is incomplete, follow [Google Calendar setup](google-calendar-setup.md).
6. Click the **Calendar icon** in the top bar. If needed, click **Connect Google Calendar**, use your existing Google account, and complete Google's consent screen. Select your calendar in **Calendar for [person]**.
7. Check that the Calendar panel says **Connected** and displays a selected calendar. Setup is not part of the recording. If setup is unavailable, the app disables the calendar actions and explains what is needed; it does not pretend that sample data updated Google.

## 2. Authorize the preload script — off camera

From the project root:

```sh
cd web
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

Optional fixed recording date, when preparing a new clean run:

```sh
node scripts/seed-calendar-demo.mjs --clean --date=2026-09-14
```

The date must be in the future. Without `--date`, the script chooses two days ahead in Toronto.

The script:

1. Checks your login, the updated app, Google connection, and selected calendar.
2. In clean mode, cancels only the previous seed-owned Google event and deletes only the recorded **Alex (calendar demo)** profile. It protects other patients and your account settings.
3. Creates a fresh **Alex (calendar demo)** under **your login**, using Mobility & Physiotherapy as the starting plan.
4. Adds a **10:00–11:00 AM physiotherapy appointment** and a **9:30–10:00 AM ride**, both assigned to your account for this rehearsal.
5. Links the ride through **Moves with**, records your synthetic availability from **8:00 AM–6:00 PM**, and saves one verified communication preference.
6. Creates one **real Google Calendar event** for the appointment, titled **Alex physiotherapy (Carestead demo)**, with **no guests**.
7. Saves your handover checkpoint and prepares a **2:00–3:00 PM reschedule proposal**. Its linked ride moves to **1:30–2:00 PM**. The proposal remains unapproved for the recording.
8. Saves and checks a grounded answer to **What does Alex prefer?**, including the verified memory and its source, and writes your date, account, calendar and current recipient links to **`web/.playwright-runs/live-demo/calendar-demo.local.md`**.

Wait for **Ready: Alex (calendar demo)**. Open the run-sheet file. Use its new link after every clean run; a fresh recipient has a fresh ID.

Running the seed again without `--clean` retains an unused ready proposal. After a take, use `--clean` to get an empty history and fresh proposal. Sent external emails/SMS cannot be recalled; use **Carestead inbox** for repeatable recordings.

Clean mode deliberately stops if Google has an uncertain action, an event has acquired guests, or the dedicated profile was renamed. Resolve the named condition rather than deleting unrelated records. A Google outage cannot be made safe by silently substituting seed results.

## 4. Arrange the recording — off camera

1. Use a desktop browser at about **1440 × 960**, with the sidebar visible. Keep zoom at 90–100% and text readable.
2. Open the run-sheet Calendar link. Check **Connected**, the original **10 AM** appointment, and one pending **Reschedule appointment** proposal showing the appointment and ride changes. Do **not** approve it yet.
3. Click **Ask Carestead**. Check the saved answer to **What does Alex prefer?** and its **Evidence used → Verified fact** section. It should recall “Alex prefers one concise written update when appointment times change,” with the synthetic verification source. This demonstrates memory saved before this conversation, not a fact invented in the answer.
4. In the same browser you will record, click the **microphone / Start voice input** button and allow microphone access. Say **What does Alex prefer?**, check the transcript, then click **Send message**. This checks real speech recognition before the take. Leave spoken replies off for the 1:45 recording so the app does not talk over your narration. If the microphone is disabled, use a supported browser; typing is a fallback and must not be described as a live voice demo. Raw audio is not stored by Carestead; the browser may use its vendor's speech service. Press Escape to close chat.
5. Keep the run sheet and this speaker script on another display or outside the recording area.
6. Sign out in the browser where you tested microphone access. Enter your existing email/password before starting; leave the password masked. Start recording immediately before clicking **Sign in**.
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
| **1:30–1:45** | Click **Demo** in the sidebar, then **Evaluations**. Briefly show the benchmark cards, then scroll to the newest notification and **Caregiver-approved calendar action** records. Point to **Tool**, **Policy**, and **Outcome**. | “The tools, approvals, and outcomes are traceable. Synthetic benchmarks keep failures visible. One change, coordinated and recorded, with the caregiver in control.” |

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
