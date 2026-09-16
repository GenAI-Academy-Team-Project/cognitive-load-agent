# Carestead v2 presentation script

Total pitch time: 2 minutes 40 seconds. Each speaker has approximately 1 minute 20 seconds.

## Speaker 1: slides 1 to 8

### Slide 1: Carestead

Caregiving means managing more than tasks. One person often carries the changing checklist across appointments and people. Carestead reduces that load.

### Slide 2: Meet Maya

Meet Maya. She coordinates Alex's care while balancing work and family, connecting information held by different people.

### Slide 3: The coordination gap

When one detail changes, calendars, transport, and responsibilities can remain outdated. Reminders alone cannot close that coordination gap.

### Slide 4: Meet Carestead

Carestead creates one shared workspace with a reusable Care Plan, trusted Care Circle, Care Organizer, and live Care Handover.

### Slide 5: Product map

Around one care recipient, caregivers manage routines, responsibilities, appointments, contacts, notifications, activity history, chat, voice, documents, and approvals.

### Slide 6: Caregiver journey

The journey moves from understanding the person to identifying needs, coordinating support, approving a safe action, and recording the outcome.

### Slide 7: Grounded chat and reviewable actions

A caregiver asks Carestead naturally, inspects the evidence, and requests an action. Carestead prepares the exact change for caregiver approval.

### Slide 8: Voice and multimodal intake

Updates can arrive as speech, notes, documents, or images. The model extracts information, and the agent validates it before saving.

Handoff: Now we will explain the agent design behind that experience.

## Speaker 2: slides 9 to 16

### Slide 9: Agent capability types

Carestead uses several capability patterns. The LLM handles language, extraction, and summarization. Agentic workflows add retrieval, decisions, tools, approval, and verification.

### Slide 10: Workflow capability map

Across eight workflows, each card separates the model contribution from the controls enforced by the agent and orchestrator.

### Slide 11: Technical architecture

Authenticated APIs connect the interface to a TypeScript orchestrator, recipient-scoped retrieval, the OpenAI Responses API, policy gates, and narrow tools.

### Slide 12: Decision path

Missing evidence triggers clarification. Read-only questions return grounded answers. Consequential actions require authorization, approval, verification, and an audit record.

### Slide 13: Bounded autonomy

The LLM interprets and summarizes. Deterministic code controls recipient scope, consent, feasibility, and tool access. The caregiver makes the decision.

### Slide 14: Evaluation

We score retrieval, grounding, decisions, policy, tools, outcomes, and safety across 104 synthetic scenarios. One safety violation fails the run.

### Slide 15: Mobile

The same workspace is moving to an iPhone pilot with care plans, calendar, handover, approvals, and native voice.

### Slide 16: Impact

Carestead turns a scattered care story into a shared, reviewable next step. Less to carry. More care to give. Now let us demonstrate it.
