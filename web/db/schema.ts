import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const careCircleMembers = sqliteTable("care_circle_members", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  userId: text("user_id"),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index('idx_care_circle_user_id').on(table.userId),
  uniqueIndex('idx_care_circle_email').on(table.email),
]);

export const auditEntries = sqliteTable("audit_entries", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  detail: text("detail").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index('idx_audit_created_at').on(table.createdAt),
]);

export const careRecipients = sqliteTable('care_recipients', {
  id: text('id').primaryKey(),
  householdId: text('household_id').notNull(),
  displayName: text('display_name').notNull(),
  timezone: text('timezone').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_recipients_household').on(table.householdId),
]);

export const planTemplates = sqliteTable('plan_templates', {
  id: text('id').primaryKey(),
  templateKey: text('template_key').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_template_key_version').on(table.templateKey, table.version),
]);

export const templateResponsibilities = sqliteTable('template_responsibilities', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  cadence: text('cadence').notNull(),
  ownerRole: text('owner_role').notNull(),
  dueOffsetDays: text('due_offset_days').notNull(),
}, (table) => [
  index('idx_template_tasks_template').on(table.templateId),
]);

export const templateRiskRules = sqliteTable('template_risk_rules', {
  id: text('id').primaryKey(),
  templateId: text('template_id').notNull(),
  name: text('name').notNull(),
  conditionText: text('condition_text').notNull(),
  severity: text('severity').notNull(),
  approvalRequired: text('approval_required').notNull(),
  expectedOutcome: text('expected_outcome').notNull(),
}, (table) => [
  index('idx_template_rules_template').on(table.templateId),
]);

export const carePlans = sqliteTable('care_plans', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  templateKey: text('template_key').notNull(),
  templateVersion: text('template_version').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  activatedAt: text('activated_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_plans_recipient_status').on(table.recipientId, table.status),
]);

export const recordScopes = sqliteTable('record_scopes', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  planId: text('plan_id'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_scope_entity').on(table.entityType, table.entityId),
  index('idx_scope_recipient_type').on(table.recipientId, table.entityType),
]);

export const recipientMembers = sqliteTable('recipient_members', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  accessRole: text('access_role').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_recipient_member').on(table.recipientId, table.memberId),
  index('idx_recipient_members_member').on(table.memberId),
]);

export const planOverrides = sqliteTable('plan_overrides', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  field: text('field').notNull(),
  value: text('value').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_plan_overrides_plan').on(table.planId),
]);

export const recipientProfiles = sqliteTable('recipient_profiles', {
  recipientId: text('recipient_id').primaryKey(),
  preferredName: text('preferred_name').notNull(),
  pronouns: text('pronouns').notNull(),
  careContext: text('care_context').notNull(),
  communicationNotes: text('communication_notes').notNull(),
  mobilityNotes: text('mobility_notes').notNull(),
  homeBase: text('home_base').notNull(),
  emergencyPlan: text('emergency_plan').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const supportContacts = sqliteTable('support_contacts', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  name: text('name').notNull(),
  relationship: text('relationship').notNull(),
  contactType: text('contact_type').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  organization: text('organization').notNull(),
  notes: text('notes').notNull(),
  priority: text('priority').notNull(),
  status: text('status').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_support_contacts_recipient_status').on(table.recipientId, table.status),
]);
