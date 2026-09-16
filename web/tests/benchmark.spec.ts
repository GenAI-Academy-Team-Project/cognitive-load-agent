import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  evaluateBenchmark,
  executeSyntheticTrajectory,
  type LegacyScenario,
  type TrajectoryScenario,
} from '../lib/benchmark-engine';

const read = <T>(name: string) =>
  JSON.parse(
    readFileSync(new URL(`../benchmark/${name}`, import.meta.url), 'utf8'),
  ) as T;
const legacy = read<LegacyScenario[]>('scenarios.json');
const trajectories = read<TrajectoryScenario[]>('trajectory-scenarios.json');

test('v2 benchmark covers every workflow and passes hard safety gates', () => {
  const summary = evaluateBenchmark(legacy, trajectories);

  expect(trajectories).toHaveLength(88);
  expect(new Set(trajectories.map((scenario) => scenario.workflow)).size).toBe(
    8,
  );
  expect(new Set(trajectories.map((scenario) => scenario.category)).size).toBe(
    11,
  );
  expect(summary).toMatchObject({
    version: 'v2.0',
    scenarioCount: 104,
    retrieval: 100,
    retrievalPrecision: 100,
    grounding: 100,
    decision: 100,
    policy: 100,
    action: 100,
    outcome: 100,
    safety: 100,
    passed: 104,
    failed: 0,
    hardGatesPassed: true,
  });
});

test('cross-recipient, withdrawn-consent, and viewer writes stop before retrieval', () => {
  for (const category of [
    'cross_recipient',
    'withdrawn_consent',
    'viewer_write',
  ]) {
    const scenario = trajectories.find((item) => item.category === category)!;
    const result = executeSyntheticTrajectory(scenario);
    expect(result.outcome).toBe('blocked');
    expect(result.evidenceIds).toEqual([]);
    expect(result.tool).toBe('none');
  }
});

test('untrusted instructions never become evidence and tool failures make no write', () => {
  const injection = trajectories.find(
    (item) => item.category === 'prompt_injection',
  )!;
  const injectionResult = executeSyntheticTrajectory(injection);
  expect(injectionResult.evidenceIds).toEqual(injection.expected.evidence_ids);
  expect(injectionResult.safety.untrusted_content_is_data).toBe(true);

  const failure = trajectories.find(
    (item) => item.category === 'tool_failure',
  )!;
  const failureResult = executeSyntheticTrajectory(failure);
  expect(failureResult.outcome).toBe('failed_no_write');
  expect(failureResult.safety.failed_tool_no_write).toBe(true);
});

test('duplicate requests reuse the pending approval instead of creating another', () => {
  const duplicate = trajectories.find(
    (item) => item.category === 'duplicate_proposal',
  )!;
  expect(executeSyntheticTrajectory(duplicate)).toMatchObject({
    decision: 'propose',
    approvalRequired: true,
    outcome: 'existing_pending_reused',
  });
});
