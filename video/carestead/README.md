# Carestead — Less to carry

A separate 60-second, 1920×1080, 24 fps product film. The working web and mobile applications are untouched. Everything needed for a local re-render is inside this directory after dependency installation; no application server, credentials, or other pitch projects are used.

**Watch:** `output/carestead-film.mp4`, or serve this directory and open `watch.html`. English captions are selectable in the player. `output/storyboard.jpg` is a twelve-frame contact sheet.

## Visual treatment and limitations

The people scenes use newly generated photorealistic stills with slow camera movement, not live-action footage. The connected Runway free workspace had no video models available. Maya, Alex, and Priya are fictional generated characters. The mobile UI is an animated editorial reconstruction, not a recording of the application or proof of an executed action. No changes were sent to the real Carestead app.

The film keeps the same phone composition through the middle sequence and links appointment change → affected responsibilities → proposed coverage → Maya's explicit approval → shared handover. People scenes bookend that sequence. Document intake lasts two seconds and requires review. Only care coordination is depicted.

The supplied voiceover was condensed for a natural 60-second runtime. Exact production copy and all scene boundaries are in `story.json`. Maya's questions use a separate synthetic voice. Narration uses Ava; Maya uses Jenny. Synthesis rate is +8%; two short takes are fitted by approximately 8–9% in the current render. Exact fitting factors and actual speech intervals are recorded in `output/timing.json`. Captions follow synthesis word timings with those adjustments. The soundtrack is an original soft synthesized keyboard score, generated locally by `render.py`.

## Re-render

Python 3.14 was used for this delivery.

```sh
cd video/carestead
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# Existing generated voice takes can be reused offline.
# After changing copy, remove ONLY the corresponding assets/voice-NN.mp3
# and assets/voice-NN.jsonl takes, then regenerate them:
.venv/bin/python narrate.py
.venv/bin/python render.py --preview
.venv/bin/python render.py
.venv/bin/python verify.py
python3 -m http.server 8038 --bind 127.0.0.1
# Open http://127.0.0.1:8038/watch.html
```

`narrate.py` requires internet access to the speech service. Rendering needs no network once dependencies and voice assets exist. FFmpeg is supplied by `imageio-ffmpeg`. No global FFmpeg installation is necessary. A long replacement narration take fails with an actionable error rather than silently forcing an extreme speaking speed.

## Editing

- `story.json`: scene boundaries, runtime, narration copy, voice-cue times.
- `components.py`: reusable smartphone, mental-load thoughts, risk cards, coverage plan, approval controls, handover, final branding; shared typography and palette.
- `render.py`: choreography, camera movement, dissolves, document intake, sound mix, caption generation, export.
- `assets/`: local image, logo, font and narration sources. Replace the three people stills to change casting; keep the scene names to reuse timing.
- `watch.html`: accessible local player with download and caption controls.
- `verify.py`: decodes the final video, checks resolution/frame count/duration/codecs, validates audio energy and peaks, and checks narration/caption bounds.

The approval tap occurs at 45.3 seconds; before it the proposal has Approve, Edit and Cancel controls. Only after the tap does “Coverage updated” appear. The handover's evening check-in is still pending completion, even though Sarah was assigned in the plan.

## Repository assets and brand provenance

- Palette: `web/app/globals.css`: cream `#fffaf2`, ink `#284536`, primary green `#356447`, sage `#e7efdf`, amber `#f3edcf`, rose `#f8e6e7`. These current CSS tokens supersede the older indigo/teal pitch materials and prose design notes.
- Typography: `web/app/layout.tsx`: Outfit headings, DM Sans body. Locally cached Latin WOFF2 assets were losslessly converted into TTF containers; local copies are included. Mobile itself uses platform fonts; the film uses the web brand fonts consistently.
- Logo: exact copies of `web/public/carestead-icon.svg` and `web/public/carestead-icon-192.png`.
- UI patterns: `web/app/care-theme.css`, `mobile/src/mobile.css`, current repository care-plan and approval captures. Purpose-colored panels, named responsibilities, evidence links and explicit approval controls are preserved.
- Document: copied from `docs/samples/physiotherapy-appointment-intake.png`, shown as an illustrative intake example.
- People: generated for this film on 2026-09-16, using the opening Maya image as the visual reference for subsequent scenes. No old pitch footage was used.

Generated MP4/WAV files and the virtual environment are ignored by Git. Source stills and fonts are part of the project. Render results remain on disk in `output/`.
