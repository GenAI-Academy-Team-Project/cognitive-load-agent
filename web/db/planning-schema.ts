import { anticipationSchema, anticipationTables } from './anticipation-schema';
// Side tables keep existing task/memory migrations and positional inserts compatible.
export const planningSchema = [
  ...anticipationSchema,
  `CREATE TABLE IF NOT EXISTS task_planning (task_id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, owner_member_id TEXT NOT NULL, duration_minutes INTEGER NOT NULL, depends_on TEXT NOT NULL, backup_member_id TEXT NOT NULL, requirements_json TEXT NOT NULL, accepted_signature TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_task_planning_recipient ON task_planning(recipient_id)`,
  `CREATE TABLE IF NOT EXISTS caregiver_availability (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, categories_json TEXT NOT NULL, capabilities_json TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_availability_recipient ON caregiver_availability(recipient_id, start_at)`,
  `CREATE TABLE IF NOT EXISTS planning_proposals (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_proposals_recipient ON planning_proposals(recipient_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS coverage_offers (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, proposal_id TEXT NOT NULL, task_id TEXT NOT NULL, member_id TEXT NOT NULL, status TEXT NOT NULL, signature TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_coverage_task ON coverage_offers(task_id) WHERE status='pending'`,
  `CREATE TABLE IF NOT EXISTS handover_checkpoints (recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, acknowledged_at TEXT NOT NULL, PRIMARY KEY(recipient_id,member_id))`,
  `CREATE TABLE IF NOT EXISTS memory_facts (memory_id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, subject TEXT NOT NULL, attribute TEXT NOT NULL, valid_until TEXT NOT NULL, superseded_by TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_memory_facts_recipient ON memory_facts(recipient_id)`,
  // A failed precondition aborts the entire D1 batch, including every write after it.
  `CREATE TABLE IF NOT EXISTS planning_guards (id TEXT PRIMARY KEY, valid INTEGER NOT NULL CHECK(valid=1))`,
];

export const planningTables = [
  ...anticipationTables,
  'task_planning',
  'caregiver_availability',
  'planning_proposals',
  'coverage_offers',
  'handover_checkpoints',
  'memory_facts',
] as const;
