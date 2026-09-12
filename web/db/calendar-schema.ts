export const calendarSchema = [
  `CREATE TABLE IF NOT EXISTS google_connections (member_id TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, google_sub TEXT NOT NULL, email TEXT NOT NULL, refresh_token TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS google_oauth_states (state_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL, session_hash TEXT NOT NULL, recipient_id TEXT NOT NULL, verifier TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS calendar_bindings (member_id TEXT NOT NULL, recipient_id TEXT NOT NULL, connection_id TEXT NOT NULL, calendar_id TEXT NOT NULL, calendar_name TEXT NOT NULL, PRIMARY KEY(member_id,recipient_id))`,
  `CREATE TABLE IF NOT EXISTS calendar_appointments (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, connection_id TEXT NOT NULL, calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, task_id TEXT NOT NULL, title TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL, timezone TEXT NOT NULL, location TEXT NOT NULL, attendees_json TEXT NOT NULL, reminder_minutes TEXT NOT NULL, status TEXT NOT NULL, html_link TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_appointments_recipient ON calendar_appointments(recipient_id,start_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_active_task ON calendar_appointments(task_id) WHERE status='confirmed'`,
  `CREATE TABLE IF NOT EXISTS calendar_actions (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, connection_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, error TEXT, html_link TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_calendar_actions_recipient ON calendar_actions(recipient_id,member_id,created_at)`,
];
