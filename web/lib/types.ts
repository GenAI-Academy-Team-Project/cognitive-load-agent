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
  currentUser: CurrentUser;
  benchmark: BenchmarkSummary;
  agentMode: "deterministic";
};
