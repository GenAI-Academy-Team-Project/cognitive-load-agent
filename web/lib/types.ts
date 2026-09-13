export type Risk = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  status: "open" | "needs_approval" | "resolved";
  confidence: string;
  rationale: string;
  proposed_action: string;
  updated_at: string;
};

export type CareTask = {
  id: string;
  title: string;
  owner: string;
  due_at: string;
  status: "open" | "due_soon" | "assigned" | "scheduled" | "complete" | "archived";
  category: string;
  source_risk_id: string | null;
};

export type CareEvent = {
  id: string;
  type: string;
  title: string;
  detail: string;
  source: string;
  occurred_at: string;
};

export type MemoryRecord = {
  id: string;
  kind: string;
  value: string;
  source: string;
  confidence: string;
  status: string;
  updated_at: string;
};

export type Approval = {
  id: string;
  risk_id: string;
  action: string;
  status: string;
  created_at: string;
  decided_at: string | null;
};

export type Trace = {
  id: string;
  trigger: string;
  evidence: string;
  decision: string;
  policy_status: string;
  tool: string;
  outcome: string;
  created_at: string;
};

export type CareCircleMember = {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "caregiver" | "viewer";
  status: "active" | "invited" | "archived";
  updated_at: string;
};

export type CurrentUser = {
  isGuest?: boolean;
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "caregiver" | "viewer";
};

export type CareRecipient = {
  id: string;
  display_name: string;
  timezone: string;
  status: string;
  created_at: string;
  updated_at: string;
  active_plan_id: string | null;
  active_plan_name: string | null;
};

export type CarePlan = {
  id: string;
  recipient_id: string;
  template_key: string;
  template_version: string;
  name: string;
  status: string;
  created_at: string;
  activated_at: string;
  updated_at: string;
  latest_version: string;
  update_available: boolean;
  override_count: number;
};

export type TemplateResponsibility = {
  title: string;
  category: string;
  due_offset_days: string | number;
};

export type PlanTemplate = {
  id: string;
  template_key: string;
  version: string;
  name: string;
  description: string;
  category: string;
  source: 'built_in' | 'custom';
  status: string;
  task_count: number;
  rule_count: number;
  responsibilities?: TemplateResponsibility[];
};

export type RecipientProfile = {
  recipient_id: string;
  preferred_name: string;
  pronouns: string;
  care_context: string;
  communication_notes: string;
  mobility_notes: string;
  home_base: string;
  emergency_plan: string;
  updated_at: string;
};

export type SupportContact = {
  id: string;
  recipient_id: string;
  name: string;
  relationship: string;
  contact_type: 'person' | 'provider' | 'service';
  phone: string;
  email: string;
  organization: string;
  notes: string;
  priority: 'primary' | 'important' | 'standard';
  status: 'active' | 'archived';
  updated_at: string;
};

export type ConsentRecord = {
  recipient_id: string;
  status: 'active' | 'withdrawn';
  purpose: string;
  retention_days: string;
  granted_by: string;
  granted_at: string | null;
  withdrawn_at: string | null;
  updated_at: string;
};

export type CareNotification = {
  id: string;
  recipient_id: string;
  kind: 'approval' | 'risk' | 'reminder' | 'system';
  title: string;
  detail: string;
  approval_id: string | null;
  delivery_state: 'needs_approval' | 'delivered' | 'suppressed';
  read_at: string | null;
  created_at: string;
};

export type ChatEvidence = { label: string; detail: string };

export type ChatActionRequest = {
  id: string;
  action_type: 'reschedule_task' | 'send_notification' | 'assign_task' | 'create_task' | 'run_care_check' | 'save_memory';
  summary: string;
  status: 'pending' | 'executed' | 'rejected';
  requires_approval: 'true';
  payload: Record<string, string>;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  evidence: ChatEvidence[];
  action: ChatActionRequest | null;
  created_at: string;
};

export type ChatState = {
  recipientId: string;
  recipientName: string;
  messages: ChatMessage[];
  quickPrompts: string[];
  tools?: unknown[];
  notificationChannels?: string[];
  capabilities: { voiceInput: boolean; spokenReplies: boolean; externalDelivery: boolean };
};

export type BenchmarkSummary = {
  scenarioCount: number;
  version: string;
  retrieval: number;
  decision: number;
  policy: number;
  action: number;
  passed: number;
  failed: number;
  categories: number;
};

export type DashboardState = {
  listDismissals?: { entity_type: string; entity_id: string }[];
  confirmedCoverage: number;
  risks: Risk[];
  tasks: CareTask[];
  events: CareEvent[];
  memories: MemoryRecord[];
  approvals: Approval[];
  traces: Trace[];
  careCircle: CareCircleMember[];
  recipients: CareRecipient[];
  selectedRecipient: CareRecipient;
  currentPlan: CarePlan;
  templates: PlanTemplate[];
  profile: RecipientProfile;
  supportContacts: SupportContact[];
  consent: ConsentRecord;
  notifications: CareNotification[];
  monitoring: { recentErrors: number; lastErrorAt: string | null };
  currentUser: CurrentUser;
  benchmark: BenchmarkSummary;
  agentMode: "deterministic";
};
