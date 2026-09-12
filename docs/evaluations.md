# Evaluations

[Back to Carestead](../README.md) · [Documentation index](README.md)

## Synthetic benchmark

The checked-in benchmark contains 16 fictional caregiver-coordination scenarios covering medication, transportation, appointments, check-ins, household needs, memory quality, and robustness. Ground truth specifies expected evidence, severity, approval requirements, and action class. It includes negative, stale-memory, and contradictory-state cases.

From `web/`, run:

```sh
npm run benchmark
```

The CLI calls the application's deterministic risk engine with a fixed reference clock of `2026-09-11T16:00:00Z`. The Evaluations view also exposes calculated benchmark scores.

### Observed results

Local run on September 12, 2026:

| Metric | Result | What the CLI measures |
| --- | --- | --- |
| Retrieval | 67% | Expected evidence strings found in returned evidence, aggregated across scenarios |
| Decision | 75% | Exact match to expected risk severity |
| Policy | 88% | Match between high-risk approval classification and the expected approval requirement |
| Action | 69% | Match to the expected action class, inferred from recommendation wording |
| Full passes | 11 / 16 | Severity, policy, and action all match; retrieval is scored separately |
| Failures | 5 / 16 | At least one severity, policy, or action mismatch |

Percentages are rounded. These values are a snapshot; rerun the command after changing the engine or dataset. The report prints results without making benchmark failures a nonzero-exit release gate.

### Limits

This is a compact synthetic regression set, not clinical validation, a real-world outcome study, or evidence of production readiness. String matching does not assess the full quality of retrieval or explanations. Action scoring uses a small keyword-based classifier. Policy scoring checks the engine's classification; it does not exercise API authorization or prove that an approval gate cannot be bypassed. Hard-case failures remain visible for further improvement.

Source: [scenarios](../web/benchmark/scenarios.json), [schema](../web/benchmark/schema.json), [CLI scorer](../web/benchmark/report.mjs), and [benchmark notes](../web/benchmark/README.md).

## Service and browser verification

From `web/`:

```sh
npm run test:planning
npm run test:accessibility
```

The planning suite uses in-memory SQLite to exercise production SQL. The browser suite uses a separate server and ephemeral D1 database, with accounts created through sign-up. Coverage includes approval and execution, recipient isolation, role enforcement, consent withdrawal, export/deletion, coverage acceptance, and handover behavior. Playwright and axe-core check selected surfaces for automated WCAG A/AA violations; automated checks are not a complete accessibility audit.

See feature-specific test commands and limits in [planning](care-planning.md#verification), [memory](memory-pilot.md#verification), [Calendar](google-calendar-setup.md#validation), [notifications](notification-setup.md#validation), and [authentication](authentication.md#verification-and-implementation-map). Provider mocks do not establish live delivery or OAuth correctness.

Only the synthetic benchmark was rerun for this documentation update; service and browser coverage above describes the repository's suites, not new test results.
