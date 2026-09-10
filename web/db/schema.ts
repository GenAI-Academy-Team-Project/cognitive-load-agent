import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const risks = sqliteTable("risks", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull(),
  confidence: text("confidence").notNull(),
  rationale: text("rationale").notNull(),
  proposedAction: text("proposed_action").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  dueAt: text("due_at").notNull(),
  status: text("status").notNull(),
  category: text("category").notNull(),
  sourceRiskId: text("source_risk_id"),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  source: text("source").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  source: text("source").notNull(),
  confidence: text("confidence").notNull(),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  riskId: text("risk_id").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  trigger: text("trigger").notNull(),
  evidence: text("evidence").notNull(),
  decision: text("decision").notNull(),
  policyStatus: text("policy_status").notNull(),
  tool: text("tool").notNull(),
  outcome: text("outcome").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
