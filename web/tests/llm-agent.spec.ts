import { expect, test } from '@playwright/test';

import type { CareAgentRecord, CareSnapshot } from '../lib/care-context';
import {
  deterministicHandover,
  extractCareUpdate,
  generateGroundedAnswer,
  generateHandoverBrief,
} from '../lib/llm-agent';
import type { PlannedTask } from '../lib/planning-types';

const records: CareAgentRecord[] = [
  {
    id: 'risk:risk-1',
    kind: 'risk',
    label: 'Pickup may be late',
    detail: 'medium; open; pharmacy closes at 6 PM',
  },
  {
    id: 'task:task-1',
    kind: 'responsibility',
    label: 'Pick up refill',
    detail: 'open; owner Maya; due 2030-02-03T15:00:00.000Z',
  },
];

const task: PlannedTask = {
  id: 'task-1',
  title: 'Physiotherapy appointment',
  owner: 'Maya',
  due_at: '2030-02-03T15:00:00.000Z',
  status: 'open',
  category: 'appointment',
  source_risk_id: null,
  planning: {
    task_id: 'task-1',
    recipient_id: 'recipient-1',
    owner_member_id: 'maya',
    duration_minutes: 60,
    depends_on: '',
    backup_member_id: '',
    requirements: [],
    accepted_signature: '',
  },
  accepted: false,
  calendarLinked: false,
};

function jsonFetcher(
  payload: unknown,
  inspect?: (request: RequestInit) => void,
) {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    inspect?.(init ?? {});
    return new Response(
      JSON.stringify({ output_text: JSON.stringify(payload) }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  };
}

test('grounded copilot maps only known evidence and disables response storage', async () => {
  let requestBody: Record<string, unknown> = {};
  const result = await generateGroundedAnswer(
    { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model' },
    'What needs attention?',
    'Alex',
    records,
    jsonFetcher(
      {
        content: 'The refill pickup needs attention.',
        evidence_ids: ['risk:risk-1'],
        needs_clarification: false,
      },
      (request) => {
        requestBody = JSON.parse(
          typeof request.body === 'string' ? request.body : '{}',
        );
      },
    ),
  );

  expect(requestBody.store).toBe(false);
  expect(result?.model).toBe('test-model');
  expect(result?.value.evidence).toEqual([
    {
      label: 'Pickup may be late',
      detail: 'medium; open; pharmacy closes at 6 PM',
    },
  ]);
});

test('grounded copilot rejects an invented evidence identifier', async () => {
  const result = await generateGroundedAnswer(
    { OPENAI_API_KEY: 'test-key' },
    'What needs attention?',
    'Alex',
    records,
    jsonFetcher({
      content: 'An unsupported claim.',
      evidence_ids: ['risk:not-real'],
      needs_clarification: false,
    }),
  );
  expect(result).toBeNull();
});

test('model features remain disabled without a key', async () => {
  let called = false;
  const result = await generateGroundedAnswer(
    {},
    'What needs attention?',
    'Alex',
    records,
    async () => {
      called = true;
      return new Response();
    },
  );
  expect(result).toBeNull();
  expect(called).toBe(false);
});

test('care update extraction keeps matched reschedules reviewable', async () => {
  const result = await extractCareUpdate(
    { OPENAI_API_KEY: 'test-key' },
    'Move the physiotherapy appointment to February 4, 2030 at 3 PM.',
    [task],
    'America/Toronto',
    new Date('2030-02-01T12:00:00.000Z'),
    jsonFetcher({
      drafts: [
        {
          kind: 'reschedule',
          task_id: 'task-1',
          title: 'Physiotherapy appointment',
          due_at: '2030-02-04T20:00:00.000Z',
          category: 'appointment',
          source:
            'Move the physiotherapy appointment to February 4, 2030 at 3 PM.',
          question: '',
          confidence: 'high',
        },
      ],
    }),
  );
  expect(result?.value[0]).toMatchObject({
    kind: 'reschedule',
    taskId: 'task-1',
    dueAt: '2030-02-04T20:00:00.000Z',
    confidence: 'high',
  });
});

test('care update extraction does not trust unknown task ids or invalid dates', async () => {
  const result = await extractCareUpdate(
    { OPENAI_API_KEY: 'test-key' },
    'Move the appointment sometime later.',
    [task],
    'America/Toronto',
    new Date('2030-02-01T12:00:00.000Z'),
    jsonFetcher({
      drafts: [
        {
          kind: 'reschedule',
          task_id: 'invented',
          title: 'Appointment',
          due_at: 'not-a-date',
          category: 'appointment',
          source: 'Move the appointment sometime later.',
          question: '',
          confidence: 'high',
        },
      ],
    }),
  );
  expect(result?.value[0].taskId).toBe('');
  expect(result?.value[0].dueAt).toBe('');
  expect(result?.value[0].question).toContain('Choose the responsibility');
  expect(result?.value[0].question).toContain('Confirm the exact future date');
});

test('handover validates evidence and exposes the generating model', async () => {
  const result = await generateHandoverBrief(
    { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'test-model' },
    'Alex',
    records,
    jsonFetcher({
      headline: 'Refill pickup needs review',
      summary: 'Confirm pickup before the pharmacy closes.',
      priorities: ['Pick up refill'],
      changes: [],
      watch_items: ['Pharmacy closes at 6 PM'],
      evidence_ids: ['risk:risk-1', 'task:task-1'],
    }),
  );
  expect(result?.value.generatedBy).toBe('model');
  expect(result?.value.model).toBe('test-model');
  expect(result?.value.evidence).toHaveLength(2);
});

test('handover has a deterministic fallback', () => {
  const snapshot = {
    profile: { preferred_name: 'Alex' },
    risks: [
      {
        title: 'Pickup risk',
        status: 'open',
        severity: 'medium',
        detail: 'Pickup may be late',
      },
    ],
    tasks: [
      {
        title: 'Pick up refill',
        status: 'open',
        owner: 'Maya',
        due_at: '2030-02-03T15:00:00.000Z',
      },
    ],
    events: [],
    memories: [],
    contacts: [],
    traces: [],
  } as unknown as CareSnapshot;
  const brief = deterministicHandover(snapshot, 'Alex');
  expect(brief.generatedBy).toBe('deterministic');
  expect(brief.headline).toBe('Pickup risk');
});
