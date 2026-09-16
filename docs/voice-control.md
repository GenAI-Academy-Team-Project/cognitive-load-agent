# Voice control

Carestead's signed-in web and iPhone dashboards share a **Talk to Carestead** control across all workspace screens. Tap it for each command. It does not listen in the background, on authentication screens, in guest previews, or after care consent is withdrawn.

Examples:

- “Open my calendar”, “Go to responsibilities”, “Open trusted facts”.
- “What needs attention today?” or “Summarize this screen”.
- “Create a reminder to call the care team tomorrow at nine AM”.
- “Run care check”.
- “Confirm” or “Cancel” for the action currently displayed by voice.

Voice submits recognized speech automatically. Changes still require a separate confirmation. Missing reminder times prompt a follow-up; include AM/PM. Confirmations apply only to the displayed action for the selected recipient. Navigation changes are immediate. Unsupported care operations retain the existing assistant behavior; this is not arbitrary control of every form or button. The existing backend determines supported actions, permissions, and date interpretation (currently America/Toronto).

Use Stop to discard an active recording. Mute disables spoken replies. Switching recipients, backgrounding the app, or closing the voice panel stops capture; network requests already submitted cannot be undone by stopping capture. Check the activity log after an uncertain network outcome before retrying a change.

## Web

No new environment variables or speech API keys are required. Run the existing web app on HTTPS (or localhost during development), allow microphone access, and use a browser that exposes SpeechRecognition or webkitSpeechRecognition. Unsupported browsers show an explanation; the ordinary interface remains available. Speech support varies by browser and device; see [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## iPhone

The app uses Apple's Speech and AVFoundation frameworks through the existing Capacitor bridge, including native spoken responses. See [Apple's speech recognition API](https://developer.apple.com/documentation/speech/sfspeechaudiobufferrecognitionrequest).

```sh
cd mobile
npm run ios:prepare
npm run ios:open
```

Build/install from Xcode and grant Microphone and Speech Recognition permissions. Existing backend settings are reused. No secrets belong in mobile configuration. Speech may be processed by the operating system/browser speech provider; recognized care requests are saved through the existing chat history and retention flow. Navigation commands stay local.

## Verification

`npm run test:e2e --prefix mobile -- voice.spec.ts` tests the shared UI at phone and desktop widths with mocked speech recognition and the real isolated backend: navigation, questions, clarification, approval, execution, cancellation, recipient switching, discarded recordings, and unsupported-browser feedback. It does not establish microphone accuracy or real-device permission behavior. Validate on a physical iPhone and supported web browsers before release, including denied permissions, audio interruptions, backgrounding, and spoken output.
