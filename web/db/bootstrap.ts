const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS risks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL, confidence TEXT NOT NULL, rationale TEXT NOT NULL, proposed_action TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL, due_at TEXT NOT NULL, status TEXT NOT NULL, category TEXT NOT NULL, source_risk_id TEXT)`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, source TEXT NOT NULL, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL, confidence TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, risk_id TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS traces (id TEXT PRIMARY KEY, trigger TEXT NOT NULL, evidence TEXT NOT NULL, decision TEXT NOT NULL, policy_status TEXT NOT NULL, tool TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
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
] as const;

export async function ensureDatabase(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.batch(
    seedStatements.map(([statement, values]) => db.prepare(statement).bind(...values)),
  );
}
