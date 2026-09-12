import { recipientLockSchema } from './recipient-lock-schema';
import { notificationSchema } from './notification-schema';
import { calendarSchema } from './calendar-schema';
import { planningSchema } from './planning-schema';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS auth_password_resets (account_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  ...notificationSchema,
  ...calendarSchema,
  ...recipientLockSchema,
  ...planningSchema,
  `CREATE TABLE IF NOT EXISTS auth_accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS auth_invitations (member_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS risks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL, rationale TEXT NOT NULL, proposed_action TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL, category TEXT NOT NULL, source_risk_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, source TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, confidence TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, risk_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS traces (id TEXT PRIMARY KEY, trigger TEXT NOT NULL, evidence TEXT NOT NULL, decision TEXT NOT NULL, policy_status TEXT NOT NULL, tool TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS care_circle_members (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id TEXT, email TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audit_entries (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, actor_email TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_care_circle_user_id ON care_circle_members(user_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_care_circle_email ON care_circle_members(email)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_entries(created_at)`,
  `CREATE TABLE IF NOT EXISTS care_recipients (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, display_name TEXT NOT NULL, timezone TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_recipients_household ON care_recipients(household_id)`,
  `CREATE TABLE IF NOT EXISTS plan_templates (id TEXT PRIMARY KEY, template_key TEXT NOT NULL, version TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_template_key_version ON plan_templates(template_key, version)`,
  `CREATE TABLE IF NOT EXISTS template_responsibilities (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL, cadence TEXT NOT NULL, owner_role TEXT NOT NULL, due_offset_days TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_template_tasks_template ON template_responsibilities(template_id)`,
  `CREATE TABLE IF NOT EXISTS template_risk_rules (id TEXT PRIMARY KEY, template_id TEXT NOT NULL, name TEXT NOT NULL, condition_text TEXT NOT NULL, severity TEXT NOT NULL, approval_required TEXT NOT NULL, expected_outcome TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_template_rules_template ON template_risk_rules(template_id)`,
  `CREATE TABLE IF NOT EXISTS care_plans (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, template_key TEXT NOT NULL, template_version TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, activated_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_plans_recipient_status ON care_plans(recipient_id, status)`,
  `CREATE TABLE IF NOT EXISTS record_scopes (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, recipient_id TEXT NOT NULL, plan_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_scope_entity ON record_scopes(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_scope_recipient_type ON record_scopes(recipient_id, entity_type)`,
  `CREATE TABLE IF NOT EXISTS recipient_members (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, access_role TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_recipient_member ON recipient_members(recipient_id, member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_recipient_members_member ON recipient_members(member_id)`,
  `CREATE TABLE IF NOT EXISTS plan_overrides (id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, field TEXT NOT NULL, value TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_plan_overrides_plan ON plan_overrides(plan_id)`,
  `CREATE TABLE IF NOT EXISTS recipient_profiles (recipient_id TEXT PRIMARY KEY, preferred_name TEXT NOT NULL, pronouns TEXT NOT NULL, care_context TEXT NOT NULL, communication_notes TEXT NOT NULL, mobility_notes TEXT NOT NULL, home_base TEXT NOT NULL, emergency_plan TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS support_contacts (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, name TEXT NOT NULL, relationship TEXT NOT NULL, contact_type TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, organization TEXT NOT NULL, notes TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_support_contacts_recipient_status ON support_contacts(recipient_id, status)`,
  `CREATE TABLE IF NOT EXISTS consent_records (recipient_id TEXT PRIMARY KEY, status TEXT NOT NULL, purpose TEXT NOT NULL, retention_days TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at TEXT, withdrawn_at TEXT, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, approval_id TEXT, delivery_state TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_state ON notifications(recipient_id, delivery_state, created_at)`,
  `CREATE TABLE IF NOT EXISTS data_requests (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, request_type TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_data_requests_recipient_created ON data_requests(recipient_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS rate_limit_events (id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limit_actor_action_time ON rate_limit_events(actor_user_id, action, created_at)`,
  `CREATE TABLE IF NOT EXISTS error_events (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, route TEXT NOT NULL, action TEXT NOT NULL, error_code TEXT NOT NULL, actor_user_id TEXT NOT NULL, recipient_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_error_events_created ON error_events(created_at)`,
  `CREATE TABLE IF NOT EXISTS chat_threads (id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_recipient_member ON chat_threads(recipient_id, member_id)`,
  `CREATE TABLE IF NOT EXISTS chat_action_requests (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, recipient_id TEXT NOT NULL, actor_member_id TEXT NOT NULL, action_type TEXT NOT NULL, summary TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL, requires_approval TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT, executed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_actions_recipient_status ON chat_action_requests(recipient_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, evidence_json TEXT NOT NULL, action_request_id TEXT, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_time ON chat_messages(thread_id, created_at)`,
  `PRAGMA optimize`,
];

const seedStatements = [
  [
    `INSERT OR IGNORE INTO risks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["risk-med", "medication", "Medication pickup may be missed", "Atorvastatin refill is ready, but no pickup is confirmed before the remaining supply runs out.", "high", "needs_approval", "92%", "The pharmacy marked the refill ready and the care plan shows only one dose remaining.", "Ask Maya to pick up the refill, then notify Alex.", "2026-09-10T13:10:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO risks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["risk-ride", "transport", "Physio ride has no driver", "Friday's physiotherapy appointment is confirmed, but transportation is still unassigned.", "medium", "open", "84%", "The appointment is on the calendar and there is no linked ride responsibility.", "Assign Maya or book accessible transit by Thursday evening.", "2026-09-10T12:42:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO risks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ["risk-grocery", "household", "Low-sodium groceries covered", "The weekly grocery order includes the saved low-sodium staples.", "low", "resolved", "96%", "The order matches the household preference and delivery is confirmed.", "No action needed.", "2026-09-10T09:25:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["task-med-check", "Check remaining medication supply", "Alex", "2026-09-10T09:00:00-04:00", "complete", "medication", "risk-med"],
  ],
  [
    `INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["task-pharmacy", "Pick up atorvastatin refill", "Unassigned", "2026-09-10T18:00:00-04:00", "due_soon", "medication", "risk-med"],
  ],
  [
    `INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["task-physio", "Physiotherapy appointment", "Alex", "2026-09-11T14:30:00-04:00", "scheduled", "appointment", "risk-ride"],
  ],
  [
    `INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["task-ride", "Arrange ride to physiotherapy", "Unassigned", "2026-09-11T13:45:00-04:00", "open", "transport", "risk-ride"],
  ],
  [
    `INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["task-checkin", "Evening wellbeing check-in", "Maya", "2026-09-10T20:00:00-04:00", "assigned", "check-in", null],
  ],
  [
    `INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?)`,
    ["event-pharmacy", "medication", "Refill ready", "Northside Pharmacy says the atorvastatin refill is ready for pickup.", "Pharmacy message", "2026-09-10T11:46:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?)`,
    ["event-calendar", "appointment", "Physio confirmed", "Physiotherapy is confirmed for Friday at 2:30 PM.", "Shared calendar", "2026-09-10T08:30:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO events VALUES (?, ?, ?, ?, ?, ?)`,
    ["event-grocery", "household", "Grocery delivery booked", "Low-sodium staples arrive Saturday morning.", "Grocery receipt", "2026-09-09T18:10:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["memory-pharmacy", "medication", "Preferred pharmacy: Northside Pharmacy; pickup usually handled by Maya.", "Caregiver-confirmed", "high", "verified", "2026-09-06T16:30:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["memory-food", "preference", "Household groceries should prioritize low-sodium options.", "Caregiver-confirmed", "high", "verified", "2026-08-29T10:00:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO memories VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["memory-transport", "transport", "Accessible transit requires booking at least one day in advance.", "Service policy", "medium", "review_due", "2026-08-20T12:00:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO approvals VALUES (?, ?, ?, ?, ?, ?)`,
    ["approval-med", "risk-med", "Ask Maya to pick up the refill, then notify Alex.", "pending", "2026-09-10T13:10:00-04:00", null],
  ],
  [
    `INSERT OR IGNORE INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["trace-initial", "New pharmacy message", "Refill ready + one dose remaining + no pickup owner", "Escalate medication pickup risk", "human approval required", "care-state rules", "Approval requested", "2026-09-10T13:10:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO settings VALUES (?, ?, ?)`,
    ["seeded", "true", "2026-09-10T13:10:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO households VALUES (?, ?, ?)`,
    ["household-demo", "Alex's care circle", "2026-09-10T13:10:00-04:00"],
  ],
  [
    `INSERT OR IGNORE INTO care_recipients VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['recipient-alex', 'household-demo', 'Alex', 'America/Toronto', 'active', '2026-09-10T13:10:00-04:00', '2026-09-10T13:10:00-04:00'],
  ],
  [
    `INSERT OR IGNORE INTO care_plans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['plan-alex', 'recipient-alex', 'medication-support', '1', "Alex's Medication Support", 'active', '2026-09-10T13:10:00-04:00', '2026-09-10T13:10:00-04:00', '2026-09-10T13:10:00-04:00'],
  ],
  ...[
    ['tpl-aging-v1', 'aging-at-home', '1', 'Aging at Home', 'A balanced weekly plan for safety, nutrition, appointments, and social connection.', 'whole-person'],
    ['tpl-med-v1', 'medication-support', '1', 'Medication Support', 'A simple plan for refills, supply checks, and caregiver-approved pickup.', 'medication'],
    ['tpl-med-v2', 'medication-support', '2', 'Medication Support', 'Adds a recurring medication-list review to refill, supply, and pickup responsibilities.', 'medication'],
    ['tpl-discharge-v1', 'post-discharge', '1', 'Post-Discharge: 30 Days', 'A time-bound transition plan for follow-ups, symptoms, medicines, and home support.', 'transition'],
    ['tpl-mobility-v1', 'mobility-physio', '1', 'Mobility & Physiotherapy', 'Coordinates sessions, accessible transport, home exercises, and recovery check-ins.', 'mobility'],
  ].map(([id, key, version, name, description, category]) => [
    `INSERT OR IGNORE INTO plan_templates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, key, version, name, description, category, 'built_in', 'active', '2026-09-10T13:10:00-04:00'],
  ] as const),
  ...[
    ['tpl-task-aging-safety', 'tpl-aging-v1', 'Complete weekly home-safety check', 'safety', 'weekly', 'caregiver', '1'],
    ['tpl-task-aging-grocery', 'tpl-aging-v1', 'Confirm groceries and hydration supplies', 'household', 'weekly', 'caregiver', '2'],
    ['tpl-task-aging-checkin', 'tpl-aging-v1', 'Schedule wellbeing check-in', 'check-in', 'daily', 'caregiver', '0'],
    ['tpl-task-med-supply-v1', 'tpl-med-v1', 'Check remaining medication supply', 'medication', 'weekly', 'caregiver', '1'],
    ['tpl-task-med-refill-v1', 'tpl-med-v1', 'Confirm refill status with pharmacy', 'medication', 'monthly', 'caregiver', '3'],
    ['tpl-task-med-pickup-v1', 'tpl-med-v1', 'Assign medication pickup', 'medication', 'as-needed', 'caregiver', '4'],
    ['tpl-task-med-supply-v2', 'tpl-med-v2', 'Check remaining medication supply', 'medication', 'weekly', 'caregiver', '1'],
    ['tpl-task-med-refill-v2', 'tpl-med-v2', 'Confirm refill status with pharmacy', 'medication', 'monthly', 'caregiver', '3'],
    ['tpl-task-med-pickup-v2', 'tpl-med-v2', 'Assign medication pickup', 'medication', 'as-needed', 'caregiver', '4'],
    ['tpl-task-med-list-v2', 'tpl-med-v2', 'Review current medication list', 'medication', 'monthly', 'caregiver', '7'],
    ['tpl-task-discharge-followup', 'tpl-discharge-v1', 'Confirm primary-care follow-up', 'appointment', 'once', 'caregiver', '2'],
    ['tpl-task-discharge-meds', 'tpl-discharge-v1', 'Reconcile discharge medications', 'medication', 'once', 'caregiver', '0'],
    ['tpl-task-discharge-symptoms', 'tpl-discharge-v1', 'Complete daily symptom check-in', 'check-in', 'daily', 'caregiver', '1'],
    ['tpl-task-mobility-session', 'tpl-mobility-v1', 'Confirm physiotherapy session', 'appointment', 'weekly', 'caregiver', '2'],
    ['tpl-task-mobility-ride', 'tpl-mobility-v1', 'Arrange accessible transportation', 'transport', 'weekly', 'caregiver', '1'],
    ['tpl-task-mobility-exercise', 'tpl-mobility-v1', 'Complete home exercise check-in', 'mobility', 'daily', 'caregiver', '0'],
  ].map((values) => [`INSERT OR IGNORE INTO template_responsibilities VALUES (?, ?, ?, ?, ?, ?, ?)`, values] as const),
  ...[
    ['tpl-rule-aging-missed', 'tpl-aging-v1', 'Missed wellbeing check', 'Daily check-in remains open after its due time', 'medium', 'false', 'Caregiver receives a review prompt'],
    ['tpl-rule-med-supply-v1', 'tpl-med-v1', 'Medication supply risk', 'Supply is low and refill pickup has no owner', 'high', 'true', 'Pickup is assigned before supply runs out'],
    ['tpl-rule-med-supply-v2', 'tpl-med-v2', 'Medication supply risk', 'Supply is low and refill pickup has no owner', 'high', 'true', 'Pickup is assigned before supply runs out'],
    ['tpl-rule-med-list-v2', 'tpl-med-v2', 'Medication-list review', 'Medication list has not been verified in 30 days', 'medium', 'false', 'Caregiver verifies the current list'],
    ['tpl-rule-discharge-symptom', 'tpl-discharge-v1', 'Concerning symptom', 'A symptom check records a care-team escalation flag', 'high', 'true', 'Caregiver reviews the escalation recommendation'],
    ['tpl-rule-mobility-ride', 'tpl-mobility-v1', 'Unassigned transport', 'A session is confirmed and transport is unassigned', 'medium', 'false', 'Transport is assigned before the booking cutoff'],
  ].map((values) => [`INSERT OR IGNORE INTO template_risk_rules VALUES (?, ?, ?, ?, ?, ?, ?)`, values] as const),
  ...[
    ['task', 'task-med-check'], ['task', 'task-pharmacy'], ['task', 'task-physio'], ['task', 'task-ride'], ['task', 'task-checkin'],
    ['event', 'event-pharmacy'], ['event', 'event-calendar'], ['event', 'event-grocery'],
    ['memory', 'memory-pharmacy'], ['memory', 'memory-food'], ['memory', 'memory-transport'],
    ['risk', 'risk-med'], ['risk', 'risk-ride'], ['risk', 'risk-grocery'], ['approval', 'approval-med'], ['trace', 'trace-initial'],
  ].map(([entityType, entityId]) => [
    `INSERT OR IGNORE INTO record_scopes VALUES (?, ?, ?, ?, ?, ?)`,
    [`scope-${entityType}-${entityId}`, entityType, entityId, 'recipient-alex', 'plan-alex', '2026-09-10T13:10:00-04:00'],
  ] as const),
  [
    `INSERT OR IGNORE INTO recipient_profiles VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['recipient-alex', 'Alex', 'they/them', 'Lives independently with family support for medication, transportation, appointments, and weekly household needs.', 'Prefers one clear request at a time and a phone call for time-sensitive changes.', 'Uses accessible transportation for appointments; allow extra transfer time.', 'Home — Toronto', 'For urgent health concerns, follow the documented clinical plan and contact emergency services when appropriate.', '2026-09-10T13:10:00-04:00'],
  ],
  ...[
    ['contact-maya', 'recipient-alex', 'Maya', 'Family caregiver', 'person', '416-555-0142', 'maya@example.test', '', 'Primary medication pickup and evening check-ins.', 'primary', 'active', '2026-09-10T13:10:00-04:00'],
    ['contact-pharmacy', 'recipient-alex', 'Northside Pharmacy', 'Pharmacy', 'provider', '416-555-0188', '', 'Northside Pharmacy', 'Preferred pharmacy; confirm refill readiness before arranging pickup.', 'important', 'active', '2026-09-10T13:10:00-04:00'],
    ['contact-transit', 'recipient-alex', 'Accessible Transit', 'Transportation service', 'service', '416-555-0108', '', 'City Accessible Transit', 'Book at least one day in advance.', 'important', 'active', '2026-09-10T13:10:00-04:00'],
  ].map((values) => [`INSERT OR IGNORE INTO support_contacts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values] as const),
  [
    `INSERT OR IGNORE INTO consent_records VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['recipient-alex', 'active', 'Care coordination, caregiver handover, risk review, and responsibility management.', '365', 'Initial care-circle owner', '2026-09-10T13:10:00-04:00', null, '2026-09-10T13:10:00-04:00'],
  ],
  [
    `INSERT OR IGNORE INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['notification-med', 'recipient-alex', 'approval', 'Medication pickup needs approval', 'A caregiver must approve the proposed pickup assignment before it can be released as an action notification.', 'approval-med', 'needs_approval', null, '2026-09-10T13:10:00-04:00'],
  ],
] as const;

export async function ensureDatabase(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.batch(
    seedStatements.map(([statement, values]) => db.prepare(statement).bind(...values)),
  );
}
