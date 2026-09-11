# Carestead benchmark v1

This benchmark contains synthetic caregiver-coordination scenarios. It measures whether the deterministic Carestead agent retrieves expected evidence, detects the expected severity, applies the approval policy, and recommends the expected action class.

The dataset intentionally contains easy, medium, hard, negative, stale-memory, and contradictory-state examples. All people, providers, medications, and events are fictional.

## Ground truth

Each scenario includes structured tasks, events, memories, and expected labels for severity, approval requirements, action class, and relevant evidence. The application runs this benchmark at request time and displays calculated results in the Evaluations view.

`schema.json` defines the machine-readable contract for benchmark records.

## Limitations

Version 1 is a compact regression set, not a clinical benchmark. It should grow through expert review, failure analysis, temporal perturbations, and held-out outcome labels. Policy violations are treated as hard failures.
