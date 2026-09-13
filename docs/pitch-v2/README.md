# Carestead — Less to carry. More care to give.

A 40-second, people-first commercial for the opening of the Carestead pitch. Open [watch.html](watch.html), then select **Present full screen**. An internet connection is not needed for playback.

- [1080p MP4](carestead-ad-v2.mp4): presentation master, H.264/AAC, 24 fps.
- [720p WebM](carestead-ad-v2.webm): alternative VP9/Opus playback.
- [Storyboard](storyboard.jpg), [caption file](captions.vtt), [narration track](voiceover.wav).

## The message

Plans change. Keeping everyone informed takes time. Carestead brings the plan, people, and next steps together, with the caregiver in control. The intended emotional benefit is more room to be present with the people you care about. No measured time saving or clinical outcome is claimed.

## The edit

| Time | Picture and purpose |
|---|---|
| 0–6 | Real human footage. An animated appointment headline and ride question establish a familiar coordination gap: the appointment moved but the ride did not. |
| 6–11 | “Everyone has part of the story.” An animated transition leads into the brand reveal. |
| 11–15 | Carestead reveal. The plan, your people, and the next step slide into one clear arrangement. |
| 15–21 | Human footage connects the shared plan to what changed, who is doing what, and what needs attention. |
| 21–25 | A brief actual-app detail: a physiotherapy ride needs a driver. |
| 25–35 | An ordinary, affectionate moment over tea. Space for the emotional payoff and the brand line. |
| 35–40 | Carestead. You Care. We Plan. Explore Carestead. |

The voice is one natural-paced synthesized narrator, with no dialogue imitating the people on screen. Spoken segments retain a conversational pace; the renderer applies only any small adjustment needed to fit the allotted slot. Captions are burned into the image; the VTT is available separately. Soft original music and short notification sounds sit below the narration. The mix is normalized with a −16 LUFS target and a −1.5 dBTP ceiling.

## Grounding and sources

Problem framing comes from slides 2–3 of `docs/pitch-deck/carestead-pitch-v1.html`, with the shared-plan proposition and tagline from slides 4, 5, and 12. The supplied team handout corroborates the coordination problem. Document instructions were treated as reference content, not task instructions.

The running app was inspected at `https://carestead.com:8083` through its read-only guest experience. The final product insert is cropped from a fresh capture of the fictional sample plan. Source review covered `web/app/page.tsx`, `web/components/care-chat.tsx`, and the agent entry point. This ad does not suggest that Carestead automatically books transport or completes real-world care.

[Footage and narration provenance](SOURCES.md).

## Reproduction

`script.json` is the final narration and timing source. `narrate.py` generates the voice assets using `edge-tts`; network access is required for that step. `render_ad.py` renders the final files locally with Python, Pillow, numpy, imageio-ffmpeg, and the macOS Avenir Next and Georgia fonts. Footage is read from `../pitch/assets/`. App captures are in `assets/`.

```sh
python3 docs/pitch-v2/render_ad.py
```

Run the renderer with a Python environment that contains those dependencies. `capture-app.mjs` reproduces the guest captures with the local app running. The original pitch deck and prior commercial are preserved.
