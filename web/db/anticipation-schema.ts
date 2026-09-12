export const anticipationSchema = [
  `CREATE TABLE IF NOT EXISTS attention_settings (recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, daily_minutes INTEGER NOT NULL, digest_hour INTEGER NOT NULL, focus_mode INTEGER NOT NULL, PRIMARY KEY(recipient_id,member_id))`,
  `CREATE TABLE IF NOT EXISTS care_preferences (recipient_id TEXT PRIMARY KEY, memory_id TEXT NOT NULL, memory_value TEXT NOT NULL, start_hour INTEGER NOT NULL, end_hour INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS care_routines (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, every_days INTEGER NOT NULL, next_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_care_routines_recipient ON care_routines(recipient_id)`,
  `CREATE TABLE IF NOT EXISTS appointment_notes (recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, task_id TEXT NOT NULL, questions TEXT NOT NULL, follow_up TEXT NOT NULL, PRIMARY KEY(recipient_id,member_id,task_id))`,
  `CREATE TABLE IF NOT EXISTS generated_batches (recipient_id TEXT NOT NULL, source_key TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(recipient_id,source_key))`,
];
export const anticipationTables = [
  'attention_settings',
  'care_preferences',
  'care_routines',
  'appointment_notes',
  'generated_batches',
] as const;
