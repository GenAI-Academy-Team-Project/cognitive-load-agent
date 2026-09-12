# Product diagrams

The root [README](../../README.md) embeds PNG exports of these editable SVG sources. Update each source and regenerate its PNG together so downloaded images and repository previews stay consistent.

| Diagram | Source | Account feature represented |
| --- | --- | --- |
| Product features | [SVG](carestead-core-features.svg) · [PNG](carestead-core-features.png) | Accounts, invitations, recipient roles, and privacy controls |
| Technical architecture | [SVG](carestead-technical-architecture.svg) · [PNG](carestead-technical-architecture.png) | Sign-in UI, session/membership boundary, and account/session/invitation storage in D1 |
| Caregiver journey | [SVG](carestead-user-journey.svg) · [PNG](carestead-user-journey.png) | Account creation or sign-in before selecting an authorized recipient |
| Agent decision path | [SVG](carestead-decision-path.svg) · [PNG](carestead-decision-path.png) | Session, membership, role, and consent checks before retrieval and actions |

The detailed enrollment flow and authentication sequence are maintained as Mermaid blocks in the [authentication guide](../authentication.md). The project README also contains an end-to-end account-to-handover flow. These complement the agent diagrams: signing in grants identity, recipient membership grants access, and approval authorizes a proposed care action.

To regenerate the four PNG exports after installing the web project dependencies:

```bash
node docs/images/render.mjs
```

The renderer uses the installed Sharp dependency and retains each SVG’s dimensions. Review the output for label fit and arrow placement when changing text. `carestead-architecture.png` is a legacy standalone image; the current README uses `carestead-technical-architecture.png`.
