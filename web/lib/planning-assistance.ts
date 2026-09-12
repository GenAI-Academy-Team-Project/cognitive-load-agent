import { previewMove } from './planning-previews';
import { planningLimits, planningRequest, runPlanningAssistant, type PlanningTool } from '../agent/planning-assistant';
import { type AssistanceConfig, type CareAnswer } from './assistance-providers';
import { enforceRateLimit } from './guardrails';
import { assistanceState } from './optional-assistance';
import { effectiveIntegrations } from './integration-settings';
import { loadPlanning } from './planning-service';
import { isOpen } from './planning-engine';
import { localInput, localToInstant } from './calendar-time';
import type { ChatEvidence, PlanningReview } from './types';

export const planningFallback: CareAnswer = {
  content: 'Open Care planning → What if? to choose a responsibility and preview a different time. Help me plan needs AI assistance enabled in Integrations and planning permission under Optional assistance for this recipient. No care-plan changes have been made.',
  evidence: [],
};

// The chat route holds the recipient consent/deletion lease. Every dispatch rechecks access.
export async function assistPlanning(db: D1Database, config: AssistanceConfig, recipientId: string, memberId: string, message: string, fetcher: typeof fetch = fetch): Promise<CareAnswer> {
  const request = planningRequest(message);
  if (!request || message.length > 1200) return planningFallback;
  const initial = await assistanceState(db, config, recipientId, false);
  if (!initial.llm.available || !initial.llm.allowed || !initial.planningAllowed) return planningFallback;
  if (!request.question) return {
    content: 'What scheduling problem would you like help with? Describe a responsibility and the change you are considering in the next 14 days. For example: “Help me plan: could the physiotherapy appointment move to tomorrow afternoon?” I can check up to two options for you to review. No care-plan changes have been made.',
    evidence: [],
  };
  let outcome = 'fallback';
  try {
    const signal = AbortSignal.timeout(planningLimits.timeoutMs);
    const authorize = async () => {
      signal.throwIfAborted();
      const latest = await assistanceState(db, config, recipientId, false);
      const access = await db.prepare("SELECT c.status consent FROM recipient_members rm JOIN care_recipients r ON r.id=rm.recipient_id JOIN consent_records c ON c.recipient_id=r.id JOIN care_circle_members m ON m.id=rm.member_id WHERE rm.recipient_id=? AND rm.member_id=? AND r.status='active' AND m.status='active'").bind(recipientId, memberId).first<{ consent: string }>();
      if (access?.consent !== 'active' || !latest.llm.available || !latest.llm.allowed || !latest.planningAllowed) throw new Error('Planning assistance paused');
    };
    await authorize();
    await enforceRateLimit(db, memberId, 'planning_assistance');
    const effective = await effectiveIntegrations(db, config);
    const state = await loadPlanning(db, recipientId, memberId);
    const recipient = await db.prepare('SELECT timezone FROM care_recipients WHERE id=?').bind(recipientId).first<{ timezone: string }>();
    if (!recipient) throw new Error('Recipient unavailable');
    const zone = recipient.timezone, now = Date.now(), horizon = now + 14 * 86400000;
    const candidates = state.tasks.filter((task) => isOpen(task) && Date.parse(task.due_at) > now && Date.parse(task.due_at) <= horizon);
    const selected = candidates.slice(0, 20);
    if (!selected.length) return { content: 'No future responsibilities were found in the next 14 days. Open Care planning to review the full plan. No care-plan changes have been made.', evidence: [] };
    const refs = new Map(selected.map((task, i) => [`t${i + 1}`, task]));
    const simulations = new Map<string, { review: PlanningReview; evidence: ChatEvidence[]; conflicts: string[] }>();
    const evidence: ChatEvidence[] = [{ label: 'Planning scope', detail: `${selected.length} of ${candidates.length} future responsibilities in the next 14 days. Availability checks use this recipient’s plan only. Snapshot: ${new Date(now).toISOString()}.` }];
    const tools: PlanningTool[] = [{
      name: 'simulate_move', description: 'Preview a responsibility and its dependent tasks at a local date/time. Returns conflicts and nearby alternatives. Does not save or change anything.',
      parameters: { type: 'object', additionalProperties: false, required: ['taskRef', 'localTime'], properties: { taskRef: { type: 'string' }, localTime: { type: 'string', description: 'YYYY-MM-DDTHH:mm in the supplied timezone' } } },
      run: async (args) => {
        await authorize();
        const task = typeof args.taskRef === 'string' ? refs.get(args.taskRef) : undefined;
        if (!task || typeof args.localTime !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(args.localTime)) throw new Error('Invalid simulation arguments');
        let dueAt: string;
        try { dueAt = localToInstant(args.localTime, zone); }
        catch { return { error: 'Choose an unambiguous valid local date/time; this time is invalid or crosses a daylight-saving clock change.' }; }
        if (Date.parse(dueAt) <= Date.now() || Date.parse(dueAt) > horizon) return { error: 'Choose a future time within the next 14 days.' };
        const simulation = previewMove(state, task.id, dueAt, zone);
        if (simulation.changes.length > 20) throw new Error('Too many dependent responsibilities');
        const id = `s${simulations.size + 1}`;
        const details = simulation.changes.map((change) => ({ label: 'Simulated change', detail: `${change.title.slice(0, 160)}: ${localInput(change.before, zone)} → ${localInput(change.after, zone)} (${zone})` }));
        const conflicts = simulation.conflicts.map((item) => item.slice(0, 350));
        simulations.set(id, { review: { taskId: task.id, dueAt }, evidence: details, conflicts });
        evidence.push({ label: `Scheduling check ${id}`, detail: conflicts.length ? conflicts.join(' ').slice(0, 1500) : `No scheduling conflicts found for ${task.title.slice(0, 160)} at ${args.localTime} (${zone}). Approval rechecks the plan; changed assignments need caregiver acceptance.` });
        return { simulationId: id, changes: details, conflicts, alternatives: simulation.alternatives.map((item) => ({ localTime: localInput(item.dueAt, zone) })) };
      },
    }];
    const input = {
      question: request.question,
      now: localInput(new Date(now).toISOString(), zone), timezone: zone, scope: 'Next 14 days, up to 20 tasks; use Care planning for the full plan.',
      tasks: [...refs].map(([ref, task]) => ({ ref, title: task.title.slice(0, 120), localTime: localInput(task.due_at, zone), minutes: task.planning.duration_minutes, category: task.category, assigned: Boolean(task.planning.owner_member_id), accepted: task.accepted, calendarLinked: task.calendarLinked })),
    };
    const answer = await runPlanningAssistant(effective, input, tools, () => authorize(), signal, fetcher);
    await authorize();
    if (answer.simulationId !== null) {
      const simulation = simulations.get(answer.simulationId);
      if (!simulation || simulation.conflicts.length) throw new Error('Unvalidated planning suggestion');
      evidence.push(...simulation.evidence, { label: 'Review suggestion', detail: 'Open What if? with this time, preview the current plan, then prepare and approve a proposal.', planningReview: simulation.review });
    }
    outcome = 'completed';
    return { content: `AI planning draft — review against the scheduling checks. ${answer.summary} No care-plan changes have been made.`, evidence };
  } catch {
    return { content: 'AI planning is temporarily unavailable or could not validate a suggestion. Open Care planning → What if? to preview a different time using local records. No care-plan changes have been made.', evidence: [] };
  } finally {
    await db.prepare('INSERT INTO audit_entries VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), 'system', 'Carestead', 'external_assistance', 'recipient', recipientId, `planning: ${outcome}`, new Date().toISOString()).run();
  }
}
