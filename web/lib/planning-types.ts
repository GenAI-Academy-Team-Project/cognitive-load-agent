import type { CareCircleMember, CareTask, MemoryRecord } from './types';
import type { AnticipationState, CarePreference, GeneratedBatch } from './anticipation-types';

export const taskCategories = [
  'general',
  'transport',
  'appointment',
  'medication',
  'household',
  'checkin',
  'check-in',
  'safety',
  'mobility',
] as const;
export type TaskDetails = {
  task_id: string;
  recipient_id: string;
  owner_member_id: string;
  duration_minutes: number;
  depends_on: string;
  backup_member_id: string;
  requirements: string[];
  fact_ids?: string[];
  accepted_signature: string;
};
export type PlannedTask = CareTask & {
  planning: TaskDetails;
  accepted: boolean;
  calendarLinked: boolean;
};
export type Availability = {
  id: string;
  member_id: string;
  start_at: string;
  end_at: string;
  categories: string[];
  capabilities: string[];
};
export type FactDetails = {
  memory_id: string;
  subject: string;
  attribute: string;
  valid_until: string;
  superseded_by: string;
};
export type PlanningMemory = MemoryRecord & { fact: FactDetails | null };
export type FactConflict = {
  key: string;
  subject: string;
  attribute: string;
  records: PlanningMemory[];
};
export type SnapshotEntry = {
  id: string;
  label: string;
  detail: string;
  kind: string;
};
export type HandoverChange = {
  id: string;
  label: string;
  kind: string;
  before: string | null;
  after: string | null;
};
export type CoverageItem = { taskId: string; memberId: string; reason: string };
export type DraftItem = {
  kind: 'create' | 'reschedule';
  taskId: string;
  title: string;
  dueAt: string;
  category: string;
  source: string;
  question: string;
  confidence?: 'high' | 'medium' | 'low';
};
export type PlanChange = {
  taskId: string;
  dueAt: string;
  before: string;
  after: string;
  title: string;
};
export type Simulation = {
  changes: PlanChange[];
  conflicts: string[];
  alternatives: { label: string; dueAt: string }[];
};
export type ProposalPayload = {
  preparationFor?: string;
  rootTaskId?: string;
  preferenceEvidence?: CarePreference;
  generated?: GeneratedBatch;
  title: string;
  start?: string;
  end?: string;
  coverage?: CoverageItem[];
  changes?: PlanChange[];
  drafts?: DraftItem[];
  baseline: PlannedTask[];
  handover?: SnapshotEntry[];
  sourceMode?: 'model' | 'deterministic';
};
export type PlanningProposal = {
  id: string;
  kind: 'relief' | 'simulation' | 'dump';
  member_id: string;
  status: 'pending' | 'applied' | 'rejected';
  payload: ProposalPayload;
  created_at: string;
};
export type CoverageOffer = {
  id: string;
  proposal_id: string;
  task_id: string;
  member_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'stale';
  signature: string;
  created_at: string;
};
export type PlanningState = {
  anticipation: AnticipationState;
  memberId: string;
  tasks: PlannedTask[];
  members: CareCircleMember[];
  availability: Availability[];
  memories: PlanningMemory[];
  conflicts: FactConflict[];
  proposals: PlanningProposal[];
  offers: CoverageOffer[];
  handover: {
    acknowledgedAt: string | null;
    snapshot: SnapshotEntry[];
    changes: HandoverChange[];
  };
};
