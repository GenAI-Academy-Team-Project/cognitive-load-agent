import { currentMemories } from './current-memories';
import type {
  CareEvent,
  CareTask,
  MemoryRecord,
  RecipientProfile,
  Risk,
  SupportContact,
  Trace,
} from './types';

export type CareSnapshot = {
  profile: RecipientProfile;
  risks: Risk[];
  tasks: CareTask[];
  events: CareEvent[];
  memories: MemoryRecord[];
  contacts: SupportContact[];
  traces: Trace[];
};

export type CareAgentRecord = {
  id: string;
  kind:
    | 'profile'
    | 'risk'
    | 'responsibility'
    | 'event'
    | 'fact'
    | 'contact'
    | 'decision';
  label: string;
  detail: string;
  occurredAt?: string;
};

const all = async <T>(db: D1Database, sql: string, values: unknown[] = []) =>
  (
    await db
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;

export async function loadCareSnapshot(
  db: D1Database,
  recipientId: string,
): Promise<CareSnapshot> {
  const scoped = (table: string, type: string, order: string, extra = '') =>
    `SELECT x.* FROM ${table} x JOIN record_scopes s ON s.entity_type='${type}' AND s.entity_id=x.id WHERE s.recipient_id=? ${extra} ORDER BY ${order}`;
  const profile = await db
    .prepare('SELECT * FROM recipient_profiles WHERE recipient_id=?')
    .bind(recipientId)
    .first<RecipientProfile>();
  const [risks, tasks, events, memories, contacts, traces] = await Promise.all([
    all<Risk>(
      db,
      scoped(
        'risks',
        'risk',
        "CASE x.severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,x.updated_at DESC",
      ),
      [recipientId],
    ),
    all<CareTask>(
      db,
      scoped('tasks', 'task', 'x.due_at', "AND x.status!='archived'"),
      [recipientId],
    ),
    all<CareEvent>(db, scoped('events', 'event', 'x.occurred_at DESC'), [
      recipientId,
    ]),
    currentMemories(db, recipientId),
    all<SupportContact>(
      db,
      "SELECT * FROM support_contacts WHERE recipient_id=? AND status='active' ORDER BY CASE priority WHEN 'primary' THEN 1 WHEN 'important' THEN 2 ELSE 3 END,name",
      [recipientId],
    ),
    all<Trace>(db, scoped('traces', 'trace', 'x.created_at DESC'), [
      recipientId,
    ]),
  ]);
  return {
    profile: profile ?? {
      recipient_id: recipientId,
      preferred_name: '',
      pronouns: '',
      care_context: '',
      communication_notes: '',
      mobility_notes: '',
      home_base: '',
      emergency_plan: '',
      updated_at: '',
    },
    risks,
    tasks,
    events,
    memories,
    contacts,
    traces,
  };
}

const clean = (value: string, max = 500) =>
  value.replace(/\s+/g, ' ').trim().slice(0, max);

export function careAgentRecords(snapshot: CareSnapshot): CareAgentRecord[] {
  const profile = [
    ['care_context', 'Care context', snapshot.profile.care_context],
    ['communication', 'Communication', snapshot.profile.communication_notes],
    ['mobility', 'Mobility and access', snapshot.profile.mobility_notes],
    ['home', 'Home base', snapshot.profile.home_base],
    ['emergency', 'Documented urgent plan', snapshot.profile.emergency_plan],
  ].flatMap(([id, label, detail]) =>
    detail
      ? [
          {
            id: `profile:${id}`,
            kind: 'profile' as const,
            label,
            detail: clean(detail),
          },
        ]
      : [],
  );
  return [
    ...profile,
    ...snapshot.risks
      .slice(0, 12)
      .map((item) => ({
        id: `risk:${item.id}`,
        kind: 'risk' as const,
        label: item.title,
        detail: clean(
          `${item.severity}; ${item.status}; ${item.detail}; rationale: ${item.rationale}; proposed: ${item.proposed_action}`,
        ),
        occurredAt: item.updated_at,
      })),
    ...snapshot.tasks
      .slice(0, 24)
      .map((item) => ({
        id: `task:${item.id}`,
        kind: 'responsibility' as const,
        label: item.title,
        detail: clean(
          `${item.status}; owner ${item.owner}; category ${item.category}; due ${item.due_at}`,
        ),
        occurredAt: item.due_at,
      })),
    ...snapshot.events
      .slice(0, 16)
      .map((item) => ({
        id: `event:${item.id}`,
        kind: 'event' as const,
        label: item.title,
        detail: clean(`${item.detail}; source ${item.source}`),
        occurredAt: item.occurred_at,
      })),
    ...snapshot.memories
      .slice(0, 16)
      .map((item) => ({
        id: `fact:${item.id}`,
        kind: 'fact' as const,
        label: item.kind,
        detail: clean(
          `${item.value}; status ${item.status}; source ${item.source}`,
        ),
        occurredAt: item.updated_at,
      })),
    ...snapshot.contacts
      .slice(0, 12)
      .map((item) => ({
        id: `contact:${item.id}`,
        kind: 'contact' as const,
        label: item.name,
        detail: clean(
          `${item.relationship}; ${item.organization}; ${item.notes}; priority ${item.priority}`,
        ),
        occurredAt: item.updated_at,
      })),
    ...snapshot.traces
      .slice(0, 8)
      .map((item) => ({
        id: `decision:${item.id}`,
        kind: 'decision' as const,
        label: item.trigger,
        detail: clean(
          `${item.decision}; policy ${item.policy_status}; tool ${item.tool}; outcome ${item.outcome}`,
        ),
        occurredAt: item.created_at,
      })),
  ];
}
