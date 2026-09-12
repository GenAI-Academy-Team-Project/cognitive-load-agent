# Carestead — Less to carry. More care to give.

A 44-second commercial with real human stock footage, a fictional family phone conversation, spoken narration, a brief product overlay, and original background music.

Open **watch.html in a browser** and press Play. `carestead-commercial.webm` uses VP9 video and Opus audio for previews that cannot play AAC. `carestead-commercial.mp4` uses H.264 video and AAC audio. Both are 1920 × 1080 at 24 fps, with the same spoken soundtrack and burned-in captions.

The voices are synthesized using macOS Samantha (Maya), Daniel (Alex), and Karen (narrator). This is dramatized voiceover over stock footage; the performers are not lip-synced to the script and are not endorsing Carestead. No generated illustrations are used in the final video.

## Spoken script

| Time | Speaker | Line |
| --- | --- | --- |
| 00–04 | Maya | Can you take Dad to his appointment tomorrow? |
| 04–07 | Alex | Tomorrow? I thought you had it. |
| 07–14 | Narrator | Caring for someone means keeping track of a thousand little things. |
| 14–21 | Narrator | Meet Carestead. One shared care plan for tasks, appointments, and who's doing what. |
| 21–27 | Narrator | It spots coordination gaps, suggests the next step, and keeps you in control. |
| 27–31 | Alex | I've got the ride. Can you handle the pickup? |
| 31–34 | Maya | Yes. It's in the plan. |
| 34–39 | Narrator | Less to carry. More care to give. |
| 39–44 | Narrator | Carestead. Make room for what matters. |

`voiceover.wav` is the speech-only track. `captions.vtt` provides timed captions. `storyboard.jpg` shows frames from the final edit. Footage sources and licensing links are in [SOURCES.md](SOURCES.md).

To reproduce on macOS with Pillow, numpy, and imageio-ffmpeg installed:

```sh
python3 docs/pitch/render_commercial.py
```

The renderer uses the clips in `assets/`, system voices and fonts, and generates an original instrumental score. Final audio targets −16 LUFS with a −1.5 dBTP ceiling.


## Product access for a live follow-up

The commercial illustrates care coordination; it does not demonstrate account creation. For a live product walkthrough, open `/sign-up` to create the first owner or `/sign-in` for an existing account. To bring another caregiver into the demo, select the recipient, use **Care circle → Invite member**, and share the generated link privately. Invited users sign up with the matching email; links expire after seven days and can be used once.

Sign-in and sign-up use the existing Carestead style system. The eye icons independently show or hide each password field. Sessions persist across reloads; use **Sign out** after the walkthrough. Only the selected recipient’s authorized records are available to each member.

See the [project overview](../../README.md#authentication-and-authorization) and [authentication guide with flow diagrams](../authentication.md) for setup, roles, API behavior, and current limits. These instructions accompany the recorded commercial; they do not describe additional scenes in its soundtrack or video.
