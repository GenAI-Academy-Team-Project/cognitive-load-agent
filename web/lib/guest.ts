import { runBenchmark } from '@/lib/benchmark';
import type { DashboardState } from '@/lib/types';

// Public, synthetic data only. Never derive this view from the deployment's care records.
export function guestDashboard(): DashboardState {
  const now = new Date().toISOString();
  const recipient = { id: 'guest-sample', display_name: 'Alex (sample)', timezone: 'America/Toronto', status: 'active', created_at: now, updated_at: now, active_plan_id: 'guest-plan', active_plan_name: 'Sample care plan' };
  return {
    currentUser: { id: 'guest', email: '', displayName: 'Guest', role: 'viewer', isGuest: true },
    confirmedCoverage: 0,
    selectedRecipient: recipient,
    recipients: [recipient],
    currentPlan: { id: 'guest-plan', recipient_id: recipient.id, template_key: 'aging-at-home', template_version: '1', name: 'Sample care plan', status: 'active', created_at: now, activated_at: now, updated_at: now, latest_version: '1', update_available: false, override_count: 0 },
    tasks: [
      { id: 'guest-ride', title: 'Arrange a ride to physiotherapy', owner: 'Unassigned', due_at: now, status: 'open', category: 'transport', source_risk_id: 'guest-risk' },
      { id: 'guest-checkin', title: 'Evening wellbeing check-in', owner: 'Maya (sample)', due_at: now, status: 'scheduled', category: 'check-in', source_risk_id: null },
      { id: 'guest-grocery', title: 'Confirm grocery delivery', owner: 'Alex (sample)', due_at: now, status: 'complete', category: 'household', source_risk_id: null },
    ],
    risks: [{ id: 'guest-risk', kind: 'transport', title: 'Physio ride has no driver', detail: 'This sample appointment needs a ride assignment.', severity: 'medium', status: 'open', confidence: '84%', rationale: 'The sample appointment has no linked driver.', proposed_action: 'Ask a caregiver to help arrange transportation.', updated_at: now }],
    events: [{ id: 'guest-event', type: 'appointment', title: 'Physiotherapy confirmed', detail: 'A sample appointment was added to the care plan.', source: 'Sample calendar', occurred_at: now }],
    memories: [], approvals: [], traces: [], careCircle: [], templates: [], supportContacts: [], notifications: [],
    profile: { recipient_id: recipient.id, preferred_name: recipient.display_name, pronouns: 'they/them', care_context: 'Fictional care plan for exploring Carestead.', communication_notes: '', mobility_notes: '', home_base: '', emergency_plan: '', updated_at: now },
    consent: { recipient_id: recipient.id, status: 'withdrawn', purpose: 'Public sample only', retention_days: '0', granted_by: '', granted_at: null, withdrawn_at: null, updated_at: now },
    monitoring: { recentErrors: 0, lastErrorAt: null },
    benchmark: runBenchmark(),
    agentMode: 'deterministic',
  };
}
