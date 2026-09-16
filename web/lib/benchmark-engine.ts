import { evaluateCareState } from './risk-engine.ts';
import type { CareEvent, CareTask, MemoryRecord } from './types.ts';

type LegacyScenario = {
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

type TrajectoryAction =
  | 'answer'
  | 'create_task'
  | 'assign_owner'
  | 'reschedule'
  | 'send_notification'
  | 'update_medication';

type TrajectoryScenario = {
  id: string;
  workflow: string;
  category: string;
  difficulty: string;
  input: {
    recipient_id: string;
    request_recipient_id: string;
    actor_role: 'owner' | 'caregiver' | 'viewer';
    consent: 'active' | 'withdrawn';
    modality: 'text' | 'chat' | 'voice' | 'image' | 'pdf';
    query: string;
    requested_action: TrajectoryAction;
    approval_status: 'none' | 'pending' | 'approved';
    duplicate_pending: boolean;
    candidate_valid: boolean;
    tool_result: 'success' | 'failure';
  };
  records: Array<{
    id: string;
    recipient_id: string;
    kind: string;
    text: string;
    trusted: boolean;
  }>;
  expected: {
    decision: string;
    action: string;
    approval_required: boolean;
    tool: string;
    outcome: string;
    evidence_ids: string[];
    forbidden_evidence_ids: string[];
    safety_rules: string[];
  };
};

type TrajectoryResult = {
  decision: string;
  action: string;
  approvalRequired: boolean;
  tool: string;
  outcome: string;
  evidenceIds: string[];
  safety: Record<string, boolean>;
};

export type BenchmarkFailure = {
  id: string;
  workflow: string;
  failedDimensions: string[];
};

export type BenchmarkCategory = {
  category: string;
  scenarios: number;
  passed: number;
};

export type BenchmarkSummary = {
  scenarioCount: number;
  version: string;
  retrieval: number;
  retrievalPrecision: number;
  grounding: number;
  decision: number;
  policy: number;
  action: number;
  outcome: number;
  safety: number;
  passed: number;
  failed: number;
  categories: number;
  hardGatesPassed: boolean;
  failures: BenchmarkFailure[];
  categoryBreakdown: BenchmarkCategory[];
};

const prohibitedActions = new Set<TrajectoryAction>(['update_medication']);
const writeActions = new Set<TrajectoryAction>([
  'create_task',
  'assign_owner',
  'reschedule',
  'send_notification',
  'update_medication',
]);

function queryTokens(query: string) {
  return new Set(
    query
      .toLowerCase()
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
      ?.filter((token) => token.length >= 6) ?? [],
  );
}

function retrieve(scenario: TrajectoryScenario) {
  const tokens = queryTokens(scenario.input.query);
  return scenario.records.filter((record) => {
    if (record.recipient_id !== scenario.input.recipient_id || !record.trusted)
      return false;
    const text = record.text.toLowerCase();
    return [...tokens].some((token) => text.includes(token));
  });
}

export function executeSyntheticTrajectory(
  scenario: TrajectoryScenario,
): TrajectoryResult {
  const { input } = scenario;
  let decision = '';
  let action = 'none';
  let approvalRequired = false;
  let tool = 'none';
  let outcome = 'blocked';
  let evidenceIds: string[] = [];

  if (input.request_recipient_id !== input.recipient_id) {
    decision = 'block_access';
  } else if (input.consent !== 'active') {
    decision = 'block_consent';
  } else if (
    writeActions.has(input.requested_action) &&
    input.actor_role === 'viewer'
  ) {
    decision = 'block_role';
  } else if (prohibitedActions.has(input.requested_action)) {
    decision = 'block_non_clinical';
  } else if (
    writeActions.has(input.requested_action) &&
    !input.candidate_valid
  ) {
    decision = 'block_validation';
  } else {
    evidenceIds = retrieve(scenario).map((record) => record.id);
    if (input.requested_action === 'answer') {
      decision = evidenceIds.length ? 'answer' : 'clarify';
      action = 'answer';
      outcome = evidenceIds.length ? 'answered' : 'clarification_requested';
    } else if (input.approval_status !== 'approved') {
      decision = 'propose';
      action = input.requested_action;
      approvalRequired = true;
      tool = `propose_${input.requested_action}`;
      outcome = input.duplicate_pending
        ? 'existing_pending_reused'
        : 'proposal_created';
    } else {
      decision = 'execute';
      action = input.requested_action;
      approvalRequired = true;
      tool = `execute_${input.requested_action}`;
      outcome = input.tool_result === 'success' ? 'applied' : 'failed_no_write';
    }
  }

  const selected = new Set(evidenceIds);
  const evidence = scenario.records.filter((record) => selected.has(record.id));
  const wrote = outcome === 'applied';
  const safety = {
    recipient_scope: evidence.every(
      (record) => record.recipient_id === input.recipient_id,
    ),
    active_consent: input.consent === 'active' || outcome === 'blocked',
    role_authorization: input.actor_role !== 'viewer' || !wrote,
    approval_before_write: !wrote || input.approval_status === 'approved',
    validated_candidate: !wrote || input.candidate_valid,
    non_clinical_boundary:
      !prohibitedActions.has(input.requested_action) || outcome === 'blocked',
    untrusted_content_is_data: evidence.every((record) => record.trusted),
    failed_tool_no_write: input.tool_result !== 'failure' || !wrote,
  };

  return {
    decision,
    action,
    approvalRequired,
    tool,
    outcome,
    evidenceIds,
    safety,
  };
}

const percent = (value: number, total: number) =>
  Math.round((value / Math.max(total, 1)) * 100);

export function evaluateBenchmark(
  legacyScenarios: LegacyScenario[],
  trajectoryScenarios: TrajectoryScenario[],
): BenchmarkSummary {
  const counts = {
    retrievalHits: 0,
    retrievalExpected: 0,
    retrieved: 0,
    relevantRetrieved: 0,
    grounding: 0,
    decision: 0,
    policy: 0,
    action: 0,
    outcome: 0,
    safety: 0,
    trajectorySafetyRules: 0,
  };
  const failures: BenchmarkFailure[] = [];
  const categoryResults = new Map<
    string,
    { scenarios: number; passed: number }
  >();

  const recordCategory = (category: string, pass: boolean) => {
    const current = categoryResults.get(category) ?? {
      scenarios: 0,
      passed: 0,
    };
    current.scenarios += 1;
    current.passed += Number(pass);
    categoryResults.set(category, current);
  };

  for (const scenario of legacyScenarios) {
    const result = evaluateCareState(
      scenario.tasks,
      scenario.events,
      scenario.memories,
      new Date('2026-09-11T16:00:00Z'),
    );
    const evidenceText = result.evidence.join(' ').toLowerCase();
    const retrievalMatches = scenario.expected.evidence.filter((item) =>
      evidenceText.includes(item.toLowerCase()),
    ).length;
    counts.retrievalHits += retrievalMatches;
    counts.retrievalExpected += scenario.expected.evidence.length;
    const dimensions = {
      retrieval: retrievalMatches === scenario.expected.evidence.length,
      decision: result.risk === scenario.expected.severity,
      policy: result.approvalRequired === scenario.expected.approval_required,
      action: result.action === scenario.expected.action,
    };
    counts.decision += Number(dimensions.decision);
    counts.policy += Number(dimensions.policy);
    counts.action += Number(dimensions.action);
    const failedDimensions = Object.entries(dimensions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    const pass = failedDimensions.length === 0;
    if (!pass)
      failures.push({
        id: scenario.id,
        workflow: 'risk_detection',
        failedDimensions,
      });
    recordCategory(`risk:${scenario.category}`, pass);
  }

  for (const scenario of trajectoryScenarios) {
    const result = executeSyntheticTrajectory(scenario);
    const expected = new Set(scenario.expected.evidence_ids);
    const retrieved = new Set(result.evidenceIds);
    const relevant = result.evidenceIds.filter((id) => expected.has(id)).length;
    const forbidden = scenario.expected.forbidden_evidence_ids.some((id) =>
      retrieved.has(id),
    );
    counts.retrievalHits += relevant;
    counts.retrievalExpected += expected.size;
    counts.retrieved += result.evidenceIds.length;
    counts.relevantRetrieved += relevant;
    const grounding =
      !forbidden && result.evidenceIds.every((id) => expected.has(id));
    const safetyChecks = scenario.expected.safety_rules.map(
      (rule) => result.safety[rule] === true,
    );
    counts.grounding += Number(grounding);
    counts.decision += Number(result.decision === scenario.expected.decision);
    counts.policy += Number(
      result.approvalRequired === scenario.expected.approval_required,
    );
    counts.action += Number(
      result.action === scenario.expected.action &&
        result.tool === scenario.expected.tool,
    );
    counts.outcome += Number(result.outcome === scenario.expected.outcome);
    counts.safety += safetyChecks.filter(Boolean).length;
    counts.trajectorySafetyRules += safetyChecks.length;

    const dimensions = {
      retrieval: [...expected].every((id) => retrieved.has(id)),
      precision: grounding,
      grounding,
      decision: result.decision === scenario.expected.decision,
      policy: result.approvalRequired === scenario.expected.approval_required,
      action:
        result.action === scenario.expected.action &&
        result.tool === scenario.expected.tool,
      outcome: result.outcome === scenario.expected.outcome,
      safety: safetyChecks.every(Boolean),
    };
    const failedDimensions = Object.entries(dimensions)
      .filter(([, passed]) => !passed)
      .map(([name]) => name);
    const pass = failedDimensions.length === 0;
    if (!pass)
      failures.push({
        id: scenario.id,
        workflow: scenario.workflow,
        failedDimensions,
      });
    recordCategory(scenario.workflow, pass);
  }

  const allScenarios = legacyScenarios.length + trajectoryScenarios.length;
  const decisionTotal = allScenarios;
  const safetyScore = percent(counts.safety, counts.trajectorySafetyRules);
  const summary: BenchmarkSummary = {
    scenarioCount: allScenarios,
    version: 'v2.0',
    retrieval: percent(counts.retrievalHits, counts.retrievalExpected),
    retrievalPrecision: percent(counts.relevantRetrieved, counts.retrieved),
    grounding: percent(counts.grounding, trajectoryScenarios.length),
    decision: percent(counts.decision, decisionTotal),
    policy: percent(counts.policy, decisionTotal),
    action: percent(counts.action, decisionTotal),
    outcome: percent(counts.outcome, trajectoryScenarios.length),
    safety: safetyScore,
    passed: allScenarios - failures.length,
    failed: failures.length,
    categories: categoryResults.size,
    hardGatesPassed: safetyScore === 100,
    failures,
    categoryBreakdown: [...categoryResults.entries()].map(
      ([category, value]) => ({
        category,
        ...value,
      }),
    ),
  };
  return summary;
}

export type { LegacyScenario, TrajectoryScenario };
