# Carestead — I can just be his daughter

Production status: script and edit plan prepared; speaking actor footage and final video are not yet produced. This is a new 42-second commercial, separate from the stock-footage/voiceover commercial in `docs/pitch/`.

User-selected production route: photorealistic AI actor with synchronized speech.

## Creative direction

A working adult daughter describes the mental work of coordinating her father's care. She demonstrates how her family uses Carestead, then describes the relief of sharing responsibility. Her father is an active, comfortable participant in the closing scene. Natural home, ordinary clothing, warm daylight, understated performance. Avoid exaggerated distress or a miraculous transformation.

One lead performer speaks all dialogue directly on camera with synchronized location sound. No narrator. During the feature demonstration, keep her speaking face visible beside the real app recording in a roughly 40/60 split composition. Film her looking toward the lens and occasionally pointing toward the product panel. Do not cover her entire speaking performance with screen footage.

Delivery: 42 seconds, landscape 1920 × 1080, 24 fps, H.264 MP4 with AAC stereo. Optional captioned export plus a clean master. Frame faces and interface details for television viewing; use deliberate crops of the actual app rather than an unreadably small full dashboard. Music is a quiet instrumental bed under the recorded dialogue, with no sung words.

## Locked dialogue and timeline

Timing is an edit target, pending an actor read. All dialogue is spoken by the lead performer, whose mouth remains visible while speaking.

| Time | Picture and action | Exact spoken dialogue | Graphic |
| --- | --- | --- | --- |
| 00:00–00:10 | Medium close-up at the kitchen table. A notebook and phone suggest an ordinary busy morning. She sets the phone down and speaks candidly to camera. Brief breath after “appointments.” | “Dad's appointments. The shopping. Who's taking him tomorrow? I was keeping the whole plan in my head—even when I was supposed to be resting.” | Small “Dramatization” label. No competing headline. |
| 00:10–00:18 | Gentle lateral move into the split composition. Real Responsibilities view: readable tasks, assigned family members, due dates, and completion state. | “With Carestead, we share one care plan. I can see what needs doing, and who's doing it.” | “One shared care plan” |
| 00:18–00:27 | Same actor remains visible. App panel moves through I need a break, reviewed coverage request, the other caregiver's Accept coverage action, and Confirmed coverage. Clearly separate request from acceptance. | “When I need a break, I request help. Once my brother accepts, I can see that the task is covered.” | “Request help. Confirm coverage.” |
| 00:27–00:32 | Real Handover panel, cropped to changes since the caregiver's previous acknowledgement. Highlight one task ownership change. | “And handover shows me what's changed since I last checked.” | “Catch up on what changed” |
| 00:32–00:39 | Full-frame lead performer beside Dad on the sofa. She speaks to camera, relaxed, then turns back toward him. Dad offers her a cup of tea. | “Now I feel supported. I can put the phone down—and just be his daughter.” | Clear the feature graphics. |
| 00:39–00:42 | Hold the human scene, with Carestead wordmark and tagline in open space beside them. Lead finishes the brand name on camera; hold for the remaining beat. | “Carestead.” | “Less to carry. More care to give.” Small “Care coordination support.” |

No website address, QR code, launch date, price, or availability promise is included because a public destination has not been established in this production brief.

## Actor recording brief

Record the exact dialogue in six takes matching the timeline, plus one continuous read. Target a conversational delivery, approximately 150 words per minute across the speaking sections, allowing pauses and the final hold. Performance should feel like a scripted television commercial, not a claimed independent customer testimonial.

Use the same performer, wardrobe, hairstyle, room, lighting direction, and microphone throughout. Record an unclipped lavalier or boom microphone track at 48 kHz and room tone. Capture a clean two-second handle before and after each take. The opening is quietly tired; the closing is a small, believable release of tension. No crying, shouting, or claims of medical improvement.

If a filmed human is required, use original recorded performances with permission for this advertisement. If the user accepts an AI actor, produce synchronized speaking video through a suitable connected service, keep character and voice consistent, and identify the synthetic performance in the production notes and any required publication disclosure. Neither route is fulfilled by adding synthesized speech to unrelated stock footage.

## Product recording brief

Use an isolated synthetic demonstration environment. Do not film personal care data, contact details, invitation links, account passwords, or local credential files.

Prepare two active caregiver accounts named Maya and Alex and a synthetic recipient named Dad. Give Alex matching availability and capabilities for the task being covered. Set the appointment transport responsibility in the future, originally assigned to Maya. Ensure required care facts, if any, are verified.

1. Record Responsibilities with a short, legible list: appointment ride, groceries, and a check-in. Show real owner and due-date fields.
2. Record Maya opening Care planning → I need a break, preparing the coverage plan, reviewing it, and approving coverage requests. This is still a request, not confirmed coverage.
3. In Alex's session, record the actual Accept coverage action. Return to Maya's session and record Confirmed coverage. Preserve this causal order in the nine-second edit; use clean cuts between readable states.
4. Before the change, acknowledge Maya's Handover snapshot. After the acceptance, record Handover showing the relevant change since that acknowledgement. Do not depict it as a complete event replay.

Capture authentic interface motion at a scale that keeps the relevant field readable in the final panel. Keep the app's current labels. Editorial headlines belong outside the interface. Do not synthesize app text inside generated actor footage.

## Feature evidence in the current code

| Ad statement | Implementation evidence | Production boundary |
| --- | --- | --- |
| Shared plan, owners, dates, completion | `web/app/page.tsx`: Responsibilities view; `web/app/api/state/route.ts`: care record actions | Shared plan is scoped to the selected recipient and authorized care circle. |
| Request a break and see accepted coverage | `web/components/care-planning.tsx`: I need a break, Accept coverage, Confirmed coverage; `web/lib/planning-service.ts`: request approval and accept_offer | Approval alone does not reassign the task; the receiving caregiver must accept. |
| See handover changes | `web/components/care-planning.tsx`: personal handover; `web/lib/planning-service.ts`: saved acknowledgement and snapshot comparison | Shows differences from a previous acknowledgement, not every intermediate event. |
| Feeling supported | Scripted character reaction | A dramatized feeling, not a measured outcome or verified customer endorsement. |

The repository also implements memory, reviewed chat actions, calendar connections, and workload planning. They are deliberately outside this short commercial so each featured capability has time to read.

## Final edit acceptance

- Export duration is 42 seconds and never exceeds 45 seconds.
- Opening pain, middle product demonstration, and closing satisfaction are all present.
- The lead's face is visible and speech is synchronized throughout her dialogue; there is no voiceover track.
- The same lead appears throughout, with a human father in the closing scene.
- Product inserts use the actual app, with request → acceptance → confirmation in that order.
- Dialogue remains clear on laptop speakers; music does not mask consonants.
- Captions are timed against the final recorded performance, stay inside the visible frame, and do not obscure product status or faces.
- Review the entire encoded video for speech synchronization, continuity, interface readability, spelling, audio clipping, and the final duration before calling it complete.

## Outstanding production input

Runway is now connected and authenticated. Its video generation tool supports native audio and character reference inputs, but the connected workspace is on the Free plan and reports no available video models. A paid plan is required before actor footage can be generated. The plan options have been presented to the user; no purchase or video generation has occurred. This document is a production package, not a finished video.

Runway's [Character Script to Video](https://help.runwayml.com/hc/en-us/articles/51285026291219-Character-Script-to-Video) documents animating a character image from a script and voice or an audio file. The connected plugin exposes general video generation with native audio; access to a dedicated Character Script to Video workflow has not been established. After a plan change, check the workspace's available video models again before selecting a generation route.

## AI performance production prompts

Use one approved character reference and one voice identity for all takes. Generate separate dialogue takes using the exact lines above and trim after inspecting actual duration and synchronization. Do not speed up the finished performance unnaturally to meet the runtime; regenerate an overlong take with the intended pacing.

Character reference: “Photorealistic fictional woman around 40, a family caregiver in an ordinary contemporary home, shoulder-length dark brown hair, understated everyday appearance, sage cotton shirt, no visible brands. Warm natural window light from camera left, eye-level medium close-up, realistic skin texture, natural proportions, cinematic television commercial photography. Mouth unobstructed, eyes toward camera, composed but a little tired. Horizontal composition with room for a product panel to the right. No writing, no logos, no interface.”

Opening performance: “Speak directly to camera as someone explaining the constant mental work of organizing her father's care. Quiet frustration, natural breaths, small glance toward the phone, then back to lens. Controlled expression, no exaggerated sadness. Deliver the supplied dialogue exactly, with synchronized visible mouth movement. Keep the camera steady with a barely perceptible push inward.”

Feature performances: “Same woman, room, clothing, voice, and lighting. Speak the supplied dialogue exactly and conversationally to camera. Thoughtful, practical confidence. Remain framed chest-up on the left, face visible throughout, with an occasional small open-hand gesture toward the right. Do not generate an app screen or any text; the actual interface will be added during editing.”

Closing performance: “Same woman, clothing, voice, and home. Seated on a sofa beside her father, a comfortable older adult in an ordinary knit cardigan. Only the woman speaks, delivering the supplied dialogue exactly toward camera. Her expression softens into a small smile. Father remains silent and offers her a cup of tea after her sentence. Natural movement and anatomically correct hands. Keep the woman's mouth clearly visible; hold the scene for the end card. No generated text or logos.”

Add the actual Carestead wordmark, feature headings, and any disclosure in the editor. Evaluate the final family shot especially carefully for speaker attribution and continuity before accepting it.
