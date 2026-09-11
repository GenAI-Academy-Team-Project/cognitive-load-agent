import scenariosJson from '@/benchmark/scenarios.json';
import { evaluateCareState } from '@/lib/risk-engine';
import type { CareEvent, CareTask, MemoryRecord } from '@/lib/types';

type Scenario = {
  id: string;
  category: string;
  difficulty: string;
  tasks: CareTask[];
  events: CareEvent[];
  memories: MemoryRecord[];
  expected: {
    severity: 'high' | 'medium' | 'low';
    approval_required: boolean;
    action: string;
    evidence: string[];
  };
};

export type BenchmarkSummary = {
  scenarioCount: number;
  version: string;
  retrieval: number;
  decision: number;
  policy: number;
  action: number;
  passed: number;
  failed: number;
  categories: number;
};

function inferredAction(recommendation: string) {
  const value = recommendation.toLowerCase();
  if (value.includes('pick') || value.includes('refill')) return 'medication_pickup';
  if (value.includes('assign')) return 'assign_owner';
  return 'monitor';
}

export function runBenchmark(): BenchmarkSummary {
  const scenarios = scenariosJson as Scenario[];
  let retrievalHits = 0;
  let retrievalTotal = 0;
  let decisions = 0;
  let policies = 0;
  let actions = 0;
  let passed = 0;

  for (const scenario of scenarios) {
    const result = evaluateCareState(scenario.tasks, scenario.events, scenario.memories);
    const evidenceText = result.evidence.join(' ').toLowerCase();
    const retrievalMatches = scenario.expected.evidence.filter((item) =>
      evidenceText.includes(item.toLowerCase()),
    ).length;
    retrievalHits += retrievalMatches;
    retrievalTotal += scenario.expected.evidence.length;
    const decisionCorrect = result.risk === scenario.expected.severity;
    const policyCorrect = (result.risk === 'high') === scenario.expected.approval_required;
    const actionCorrect = inferredAction(result.recommendation) === scenario.expected.action;
    decisions += Number(decisionCorrect);
    policies += Number(policyCorrect);
    actions += Number(actionCorrect);
    passed += Number(decisionCorrect && policyCorrect && actionCorrect);
  }

  const percent = (value: number, total: number) => Math.round((value / Math.max(total, 1)) * 100);
  return {
    scenarioCount: scenarios.length,
    version: 'v1.0',
    retrieval: percent(retrievalHits, retrievalTotal),
    decision: percent(decisions, scenarios.length),
    policy: percent(policies, scenarios.length),
    action: percent(actions, scenarios.length),
    passed,
    failed: scenarios.length - passed,
    categories: new Set(scenarios.map((scenario) => scenario.category)).size,
  };
}
