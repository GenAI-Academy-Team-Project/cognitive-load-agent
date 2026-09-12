# Optional OpenRouter assistance

Carestead's core flow remains deterministic. Optional summaries and bounded scheduling assistance use OpenRouter; no MCP server or resource-search integration is required or included.

## Setup

Set these in ignored `web/.dev.vars`, then restart the app:

```dotenv
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

Choose a model available to your account that supports tool calling and structured outputs. OpenRouter is the only LLM provider; there is no implicit model default. For production, use the existing deployment secret workflow. Never commit API keys or put them in client-side variables.

As an owner, enable **AI care assistance** in Integrations. For the selected recipient, open **Ask Carestead → Optional assistance** and allow AI assistance after reviewing the data-sharing description. Global and recipient permissions default off. Existing recipients who allowed summaries before planning assistance was added must also allow planning data sharing.

## What it does

- **Care summaries:** ask for a daily review or handover. OpenRouter receives the deterministic answer and up to eight evidence entries. The labeled draft retains the original evidence and cannot execute actions.
- **Help me plan:** explicitly request scheduling help, for example `Help me plan: Could the transport responsibility move to Thursday afternoon?`. The assistant receives up to 20 future responsibilities in the next 14 days and calls the existing scheduling simulation directly. A suggestion opens the What if? preview for review; changes still require approval.

Ordinary chat actions remain deterministic. Disabled assistance, invalid model output, provider errors and timeouts fall back to the local flow. Generated evidence indexes and simulation references are validated, but users should still review the draft against the records.

## Cost and boundaries

Summaries request at most 600 output tokens. Planning is limited to three model calls, two simulation calls, 600 output tokens per model response, 24,000 request characters and a 45-second overall timeout. Planning attempts are rate-limited to ten per member per hour. There are no automatic provider retries or model switches.

Requests prioritize price among eligible endpoints for the configured model, require supported parameters, exclude providers allowing data collection under the routing policy, and disable provider fallback. An unsupported model returns the local fallback.

Planning shares the explicit question, selected task titles/times/assignment status and scheduling results with OpenRouter and its model provider. These may contain names and sensitive care details. Full profiles and chat history are not sent. Each dispatch rechecks membership, active care consent and assistance permissions. Disabling assistance stops new requests; it does not delete data already processed by providers.

The assistant has no tools for approving proposals, delivering notifications, accepting caregiver commitments or writing calendar events. The deterministic services and their approval rules remain authoritative.
