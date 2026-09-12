import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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

export const consentRecords = sqliteTable('consent_records', {
  recipientId: text('recipient_id').primaryKey(),
  status: text('status').notNull(),
  purpose: text('purpose').notNull(),
  retentionDays: text('retention_days').notNull(),
  grantedBy: text('granted_by').notNull(),
  grantedAt: text('granted_at'),
  withdrawnAt: text('withdrawn_at'),
  updatedAt: text('updated_at').notNull(),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  approvalId: text('approval_id'),
  deliveryState: text('delivery_state').notNull(),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_notifications_recipient_state').on(table.recipientId, table.deliveryState, table.createdAt),
]);

export const dataRequests = sqliteTable('data_requests', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  requestType: text('request_type').notNull(),
  status: text('status').notNull(),
  requestedBy: text('requested_by').notNull(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => [
  index('idx_data_requests_recipient_created').on(table.recipientId, table.createdAt),
]);

export const rateLimitEvents = sqliteTable('rate_limit_events', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').notNull(),
  action: text('action').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_rate_limit_actor_action_time').on(table.actorUserId, table.action, table.createdAt),
]);

export const errorEvents = sqliteTable('error_events', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  route: text('route').notNull(),
  action: text('action').notNull(),
  errorCode: text('error_code').notNull(),
  actorUserId: text('actor_user_id').notNull(),
  recipientId: text('recipient_id'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_error_events_created').on(table.createdAt),
]);

export const chatThreads = sqliteTable('chat_threads', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_chat_thread_recipient_member').on(table.recipientId, table.memberId),
]);

export const chatActionRequests = sqliteTable('chat_action_requests', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  actorMemberId: text('actor_member_id').notNull(),
  actionType: text('action_type').notNull(),
  summary: text('summary').notNull(),
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull(),
  requiresApproval: text('requires_approval').notNull(),
  createdAt: text('created_at').notNull(),
  decidedAt: text('decided_at'),
  executedAt: text('executed_at'),
}, (table) => [
  index('idx_chat_actions_recipient_status').on(table.recipientId, table.status, table.createdAt),
]);

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  evidenceJson: text('evidence_json').notNull(),
  actionRequestId: text('action_request_id'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_chat_messages_thread_time').on(table.threadId, table.createdAt),
]);


export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});
export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull(),
  expiresAt: text('expires_at').notNull(),
}, (table) => [index('idx_auth_sessions_expiry').on(table.expiresAt)]);
export const authInvitations = sqliteTable('auth_invitations', {
  memberId: text('member_id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
});

export const googleConnections = sqliteTable('google_connections', {
  memberId: text('member_id').primaryKey(),
  id: text('id').notNull().unique(),
  googleSub: text('google_sub').notNull(),
  email: text('email').notNull(),
  refreshToken: text('refresh_token').notNull(),
  status: text('status').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const googleOauthStates = sqliteTable('google_oauth_states', {
  stateHash: text('state_hash').primaryKey(),
  memberId: text('member_id').notNull(),
  sessionHash: text('session_hash').notNull(),
  recipientId: text('recipient_id').notNull(),
  verifier: text('verifier').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const calendarBindings = sqliteTable('calendar_bindings', {
  memberId: text('member_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  connectionId: text('connection_id').notNull(),
  calendarId: text('calendar_id').notNull(),
  calendarName: text('calendar_name').notNull(),
}, (table) => [uniqueIndex('idx_calendar_binding_member_recipient').on(table.memberId, table.recipientId)]);

export const calendarAppointments = sqliteTable('calendar_appointments', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  connectionId: text('connection_id').notNull(),
  calendarId: text('calendar_id').notNull(),
  eventId: text('event_id').notNull(),
  taskId: text('task_id').notNull(),
  title: text('title').notNull(),
  startAt: text('start_at').notNull(),
  endAt: text('end_at').notNull(),
  timezone: text('timezone').notNull(),
  location: text('location').notNull(),
  attendeesJson: text('attendees_json').notNull(),
  reminderMinutes: text('reminder_minutes').notNull(),
  status: text('status').notNull(),
  htmlLink: text('html_link').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_calendar_appointments_recipient').on(table.recipientId, table.startAt), uniqueIndex('idx_calendar_active_task').on(table.taskId).where(sql`status = 'confirmed'`)]);

export const calendarActions = sqliteTable('calendar_actions', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  connectionId: text('connection_id').notNull(),
  kind: text('kind').notNull(),
  payloadJson: text('payload_json').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  htmlLink: text('html_link'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_calendar_actions_recipient').on(table.recipientId, table.memberId, table.createdAt)]);

export const memoryIntegrations = sqliteTable('memory_integrations', {
  recipientId: text('recipient_id').primaryKey(),
  scopeId: text('scope_id').notNull().unique(),
  enabled: text('enabled').notNull().default('false'),
  fingerprint: text('fingerprint').notNull().default(''),
  remoteDirty: text('remote_dirty').notNull().default('false'),
  deletionEvent: text('deletion_event'),
  lockToken: text('lock_token'),
  lockUntil: text('lock_until'),
  updatedAt: text('updated_at').notNull(),
});

export const taskPlanning = sqliteTable('task_planning', {
  taskId: text('task_id').primaryKey(), recipientId: text('recipient_id').notNull(), ownerMemberId: text('owner_member_id').notNull(),
  durationMinutes: integer('duration_minutes').notNull(), dependsOn: text('depends_on').notNull(), backupMemberId: text('backup_member_id').notNull(), requirementsJson: text('requirements_json').notNull(), acceptedSignature: text('accepted_signature').notNull(),
}, (table) => [index('idx_task_planning_recipient').on(table.recipientId)]);
export const caregiverAvailability = sqliteTable('caregiver_availability', {
  id: text('id').primaryKey(), recipientId: text('recipient_id').notNull(), memberId: text('member_id').notNull(), startAt: text('start_at').notNull(), endAt: text('end_at').notNull(), categoriesJson: text('categories_json').notNull(), capabilitiesJson: text('capabilities_json').notNull(),
}, (table) => [index('idx_availability_recipient').on(table.recipientId, table.startAt)]);
export const planningProposals = sqliteTable('planning_proposals', {
  id: text('id').primaryKey(), recipientId: text('recipient_id').notNull(), memberId: text('member_id').notNull(), kind: text('kind').notNull(), status: text('status').notNull(), payloadJson: text('payload_json').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [index('idx_planning_proposals_recipient').on(table.recipientId, table.createdAt)]);
export const coverageOffers = sqliteTable('coverage_offers', {
  id: text('id').primaryKey(), recipientId: text('recipient_id').notNull(), proposalId: text('proposal_id').notNull(), taskId: text('task_id').notNull(), memberId: text('member_id').notNull(), status: text('status').notNull(), signature: text('signature').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [uniqueIndex('idx_pending_coverage_task').on(table.taskId).where(sql`${table.status} = 'pending'`)]);
export const handoverCheckpoints = sqliteTable('handover_checkpoints', {
  recipientId: text('recipient_id').notNull(), memberId: text('member_id').notNull(), snapshotJson: text('snapshot_json').notNull(), acknowledgedAt: text('acknowledged_at').notNull(),
}, (table) => [primaryKey({ columns: [table.recipientId, table.memberId] })]);
export const memoryFacts = sqliteTable('memory_facts', {
  memoryId: text('memory_id').primaryKey(), recipientId: text('recipient_id').notNull(), subject: text('subject').notNull(), attribute: text('attribute').notNull(), validUntil: text('valid_until').notNull(), supersededBy: text('superseded_by').notNull(),
}, (table) => [index('idx_memory_facts_recipient').on(table.recipientId)]);
export const planningGuards = sqliteTable('planning_guards', {
  id: text('id').primaryKey(), valid: integer('valid').notNull(),
}, (table) => [check('planning_guard_valid', sql`${table.valid} = 1`)]);

export const attentionSettings = sqliteTable('attention_settings', {
  recipientId: text('recipient_id').notNull(), memberId: text('member_id').notNull(), dailyMinutes: integer('daily_minutes').notNull(), digestHour: integer('digest_hour').notNull(), focusMode: integer('focus_mode').notNull(),
}, (table) => [primaryKey({ columns: [table.recipientId, table.memberId] })]);
export const carePreferences = sqliteTable('care_preferences', {
  recipientId: text('recipient_id').primaryKey(), memoryId: text('memory_id').notNull(), memoryValue: text('memory_value').notNull(), startHour: integer('start_hour').notNull(), endHour: integer('end_hour').notNull(),
});
export const careRoutines = sqliteTable('care_routines', {
  id: text('id').primaryKey(), recipientId: text('recipient_id').notNull(), title: text('title').notNull(), category: text('category').notNull(), everyDays: integer('every_days').notNull(), nextAt: text('next_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_care_routines_recipient').on(table.recipientId)]);
export const appointmentNotes = sqliteTable('appointment_notes', {
  recipientId: text('recipient_id').notNull(), memberId: text('member_id').notNull(), taskId: text('task_id').notNull(), questions: text('questions').notNull(), followUp: text('follow_up').notNull(),
}, (table) => [primaryKey({ columns: [table.recipientId, table.memberId, table.taskId] })]);
export const generatedBatches = sqliteTable('generated_batches', {
  recipientId: text('recipient_id').notNull(), sourceKey: text('source_key').notNull(), createdAt: text('created_at').notNull(),
}, (table) => [primaryKey({ columns: [table.recipientId, table.sourceKey] })]);


export const notificationPreferences = sqliteTable('notification_preferences', {
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  emailEnabled: integer('email_enabled').notNull().default(0),
  smsEnabled: integer('sms_enabled').notNull().default(0),
  phone: text('phone').notNull().default(''),
  pushJson: text('push_json'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.recipientId, table.memberId] })]);

export const notificationDeliveries = sqliteTable('notification_deliveries', {
  actionId: text('action_id').primaryKey(),
  notificationId: text('notification_id').notNull().unique(),
  recipientId: text('recipient_id').notNull(),
  memberId: text('member_id').notNull(),
  channel: text('channel').notNull(),
  destination: text('destination').notNull(),
  status: text('status').notNull(),
  providerId: text('provider_id'),
  errorCode: text('error_code'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [index('idx_notification_deliveries_recipient').on(table.recipientId, table.createdAt)]);

export const notificationReads = sqliteTable('notification_reads', {
  notificationId: text('notification_id').notNull(),
  memberId: text('member_id').notNull(),
  readAt: text('read_at').notNull(),
}, (table) => [primaryKey({ columns: [table.notificationId, table.memberId] })]);

export const pushoverPreferences = sqliteTable('pushover_preferences', {
  recipient_id: text('recipient_id').notNull(),
  member_id: text('member_id').notNull(),
  user_key: text('user_key').notNull(),
  updated_at: text('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.recipient_id, table.member_id] })]);
