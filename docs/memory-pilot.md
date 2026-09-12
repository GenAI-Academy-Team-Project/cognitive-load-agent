# Reviewed memory and optional Mem0 recall

External services are optional and start off. After adding credentials and
restarting the local app (or uploading cloud secrets), sign in as a care-circle
owner and open **Integrations**. Enable the services you want to use. Switches
are saved in D1 and apply to the whole care circle. Existing deployments also
start off until an owner enables them; saved connections and preferences remain.
Missing credentials keep a switch unavailable. Local tasks, trusted facts, chat,
and in-app notifications remain usable. These switches do not replace recipient
consent, Google account connection, delivery opt-in, or action approval. Pausing
Mem0 does not delete remote facts; its existing privacy cleanup remains available.


Carestead can propose a trusted fact from chat, save it after caregiver approval,
and recall verified facts in future conversations. D1 remains authoritative.

## Try it

1. Open **Ask Carestead** and enter `Remember that Alex prefers afternoon visits.`
   Simple preference statements also produce a suggestion. Questions do not.
2. Review the exact wording and selected recipient, then choose **Save as trusted fact**.
   This confirms accuracy and shares the fact with that recipient's care circle.
   Cancel leaves it in the private conversation only.
3. Reload, return to chat, and ask `What visits does Alex prefer?`.
4. Use the existing Trusted facts controls to correct or archive it. Unverified
   and archived facts are excluded from chat's trusted evidence.

Candidate detection is deliberately local and limited to explicit “remember”
requests and simple preference statements. It preserves the original wording;
there is no automatic LLM extraction or upload of private transcripts. Mem0 is
used for semantic recall of reviewed facts. Adding richer extraction is a future
extension, not required for the pilot.

## Enable semantic recall

Set `MEM0_API_KEY` in `web/.secrets.cloudflare` and run `make cloud-secrets-check`
then `make cloud-secrets-apply` after deploying the Worker. For local development,
place it in the ignored `web/.dev.vars` file and restart the server. Do not put
it in browser-visible variables or commit it. No additional npm dependency is
required; the adapter uses the Mem0 Platform HTTP API.

The recipient owner must then open **Memory** in chat and choose **Enable external
recall**. This explicitly permits sending verified shared facts and search
questions to Mem0. The deployment key alone does not enable uploads. Caregivers
and viewers cannot enable it. Each recipient receives an opaque, random provider
scope, so seeded IDs cannot collide across deployments. Cloned plans do not copy
memory or integration settings.

The next question indexes up to the 50 most recently updated verified facts,
using `infer: false` to preserve reviewed wording. A fingerprint prevents
unchanged reuploads. Semantic results supply IDs and revisions only; Carestead
resolves them against that recipient's currently verified D1 records and shows
the original source. Local keyword recall still searches all verified facts.
When Mem0 is unavailable or busy, local recall remains available and the answer
indicates the fallback. Without a key, only local recall is available.

The pilot recalls preferences; it does not automatically reschedule tasks or
choose caregivers based on them. Existing tool approval requirements remain.

## Lifecycle and privacy

Corrections, verification and archival clear the old external index before the
change completes. The next chat rebuilds it. Mem0 deletion is asynchronous:
pending events are persisted, and a queued deletion is never reported as complete.
If cleanup is pending, retry the change shortly; if unavailable, restore service
and retry. Provider failures do not silently discard cleanup state.

**Disable and delete external memory** immediately disables recall and requests
external cleanup. When it is pending, the control becomes **Retry external cleanup**.
Withdrawal of care consent also disables external recall and requests cleanup;
if cleanup fails, care consent remains withdrawn and the owner can retry withdrawal
or recipient deletion. Permanent recipient deletion cannot report success until
external cleanup is confirmed. Keep the API key available until cleanup finishes.

Existing retention rules apply to private chat and pending proposals, including
when chat is opened directly. Approved facts follow the existing durable trusted
fact lifecycle; they are not deleted merely because their source conversation
expires. Their source message ID and confirming caregiver remain on the fact.
Owner exports include canonical facts, proposals, and external-memory status.
The provider holds verbatim copies of the indexed facts, not an independent
inferred fact store. Do not enable provider-side synthesis for this pilot project.

A database lease serializes indexing with memory mutations and privacy actions.
The pilot performs bounded provider calls and retains dirty-index state across
partial failures. Cleanup requires a subsequent request to poll a pending event;
there is no scheduled background cleanup worker.

## Verification

Run from `web`:

```sh
npx tsc --noEmit
npx playwright test tests/memory-service.spec.ts tests/memory.spec.ts tests/chat.spec.ts
```

Service tests use an in-memory SQLite database and mocked Mem0 responses. They
cover semantic paraphrases, source grounding, recipient isolation, stale revisions,
corrections, archival, consent, outages, concurrent access, and pending deletion.
Browser/API tests cover review, rejection, reload, corrections, archival, unknown
actions, unauthorized recipients, and exclusion of unverified facts. No test sends
care data to Mem0. A live provider smoke test requires your configured key and a
synthetic recipient.

API references: [Add](https://docs.mem0.ai/api-reference/memory/add-memories),
[Search](https://docs.mem0.ai/api-reference/memory/search-memories),
[Delete](https://docs.mem0.ai/api-reference/memory/delete-memories),
[Event status](https://docs.mem0.ai/api-reference/events/get-event).
