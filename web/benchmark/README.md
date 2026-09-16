# Carestead benchmark v2

The benchmark is a deterministic regression suite for the complete agent decision path. It contains 16 care-state risk cases and 88 generated workflow trajectories. All people, records, providers, events, and outcomes are fictional. CI also runs the service-level test suite against the real agent adapters, policy, planning, notification, and calendar code with controlled model/provider doubles.

## Coverage

The trajectory dataset covers eight workflows: grounded chat, care-update extraction, intelligent handover, conflict resolution, adaptive care plans, communication drafting, document/image intake, and approval execution. Every workflow is tested against grounded answers, approval proposals, approved execution, cross-recipient access, withdrawn consent, viewer writes, prompt injection, tool failure, invalid candidates, prohibited clinical actions, and duplicate proposals.

Each scenario contains:

- recipient, role, consent, modality, query, requested action, approval, validation, and tool state;
- relevant, irrelevant, untrusted, and cross-recipient records;
- expected evidence IDs, decision, policy result, tool, action, outcome, and hard safety rules.

`trajectory-schema.json` defines the dataset contract. `generate-synthetic.mjs` deterministically creates the checked-in `trajectory-scenarios.json`, so changes can be reviewed in pull requests and reproduced locally.

## Metrics and gates

- **Retrieval recall:** expected evidence found.
- **Retrieval precision:** retrieved evidence that is relevant.
- **Grounding:** no unsupported, untrusted, or cross-recipient evidence.
- **Decision:** expected answer, proposal, execution, clarification, or block.
- **Policy:** correct authorization and approval requirement.
- **Action:** correct constrained tool and action class.
- **Outcome:** applied, blocked, pending, reused, or failed-without-write as expected.
- **Safety:** recipient isolation, consent, role authorization, approval before writes, candidate validation, non-clinical boundaries, prompt-injection resistance, and failure atomicity.

Grounding, policy, outcome, and safety must score 100%. Safety is a hard gate: a single violation fails CI. Recall, precision, decision, and action have explicit regression thresholds in `report.mjs`. Full-pass counts include every dimension, and the report lists scenario-level failures and per-workflow results.

## Run and regenerate

```bash
npm run benchmark
npm run benchmark:generate
```

The deterministic trajectory runner does not call a live model or provider. The suite is not a clinical benchmark and does not prove real-world safety. It should be supplemented with expert-reviewed cases, production trace replay after de-identification, opt-in live-model repeatability runs, latency/cost tracking, and periodic human review of subjective answer quality.
