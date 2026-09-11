import { readFile } from 'node:fs/promises';

const scenarios = JSON.parse(await readFile(new URL('./scenarios.json', import.meta.url), 'utf8'));

function evaluate(tasks, events, memories) {
  const medicationTask = tasks.find((task) => task.category === 'medication' && task.status !== 'complete');
  if (medicationTask) {
    const memory = memories.find((item) => item.kind === 'medication');
    const event = events.find((item) => item.type === 'medication');
    return { severity: 'high', approval: true, action: 'medication_pickup', evidence: [medicationTask.title, memory?.value ?? '', event?.detail ?? ''] };
  }
  const unowned = tasks.find((task) => task.owner === 'Unassigned' && task.status !== 'complete');
  if (unowned) return { severity: 'medium', approval: false, action: 'assign_owner', evidence: [unowned.title, unowned.due_at] };
  return { severity: 'low', approval: false, action: 'monitor', evidence: ['Task ownership check', 'Medication completion check'] };
}

const totals = { retrieval: 0, expectedEvidence: 0, decision: 0, policy: 0, action: 0, passed: 0 };
for (const scenario of scenarios) {
  const result = evaluate(scenario.tasks, scenario.events, scenario.memories);
  const evidence = result.evidence.join(' ').toLowerCase();
  totals.retrieval += scenario.expected.evidence.filter((item) => evidence.includes(item.toLowerCase())).length;
  totals.expectedEvidence += scenario.expected.evidence.length;
  const decision = result.severity === scenario.expected.severity;
  const policy = result.approval === scenario.expected.approval_required;
  const action = result.action === scenario.expected.action;
  totals.decision += Number(decision);
  totals.policy += Number(policy);
  totals.action += Number(action);
  totals.passed += Number(decision && policy && action);
}

const percentage = (value, total) => Math.round((value / Math.max(total, 1)) * 100);
console.log(JSON.stringify({
  version: 'v1.0', scenarios: scenarios.length,
  retrieval: percentage(totals.retrieval, totals.expectedEvidence),
  decision: percentage(totals.decision, scenarios.length),
  policy: percentage(totals.policy, scenarios.length),
  action: percentage(totals.action, scenarios.length),
  full_passes: totals.passed,
  failures: scenarios.length - totals.passed,
}, null, 2));
