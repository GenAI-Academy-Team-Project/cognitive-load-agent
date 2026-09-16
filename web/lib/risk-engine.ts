import type { CareEvent, CareTask, MemoryRecord } from './types';

export type AgentDecision = {
  risk: 'high' | 'medium' | 'low';
  action:
    | 'medication_pickup'
    | 'assign_owner'
    | 'reassign_owner'
    | 'resolve_conflict'
    | 'escalate_checkin'
    | 'review_memory'
    | 'review_overdue'
    | 'monitor';
  approvalRequired: boolean;
  title: string;
  rationale: string;
  recommendation: string;
  evidence: string[];
};

export function evaluateCareState(
  tasks: CareTask[],
  events: CareEvent[],
  memories: MemoryRecord[],
  now = new Date(),
): AgentDecision {
  const open = tasks.filter(
    (task) => task.status !== 'complete' && task.status !== 'archived',
  );
  const medicationTask = open
    .filter(
      (task) =>
        task.category === 'medication' &&
        Number.isFinite(Date.parse(task.due_at)) &&
        Date.parse(task.due_at) <= now.getTime() + 36 * 3600000,
    )
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))[0];
  const refillMemory = memories.find(
    (memory) => memory.kind === 'medication' && memory.status === 'verified',
  );
  const recentMedicationEvent = events
    .filter(
      (event) =>
        event.type === 'medication' &&
        Date.parse(event.occurred_at) <= now.getTime() &&
        Date.parse(event.occurred_at) >= now.getTime() - 7 * 86400000,
    )
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  const delayedMedicationEvent = events.find(
    (event) =>
      event.type === 'medication' &&
      /delay|not ready|unavailable|problem/i.test(
        `${event.title} ${event.detail}`,
      ) &&
      Date.parse(event.occurred_at) >= now.getTime() - 7 * 86400000,
  );
  const medicationConcern =
    medicationTask ??
    (delayedMedicationEvent
      ? open.find((task) => task.category === 'medication')
      : undefined);

  if (medicationConcern) {
    return {
      risk: 'high',
      action: 'medication_pickup',
      approvalRequired: true,
      title: 'Medication pickup may be missed',
      rationale:
        'An open medication responsibility is close to its due time and no completed pickup is recorded.',
      recommendation: `Confirm the pharmacy refill and review pickup coverage${medicationConcern.owner !== 'Unassigned' ? ` with ${medicationConcern.owner}` : ' with an available caregiver'}. Request acceptance before treating it as covered.`,
      evidence: [
        medicationConcern.title,
        refillMemory?.value ?? 'No verified refill preference',
        delayedMedicationEvent?.detail ??
          recentMedicationEvent?.detail ??
          'No recent medication event',
      ],
    };
  }

  const missedCheckIn = events
    .filter(
      (event) =>
        event.type === 'check-in' &&
        /no response|missed|unable to reach/i.test(
          `${event.title} ${event.detail}`,
        ) &&
        Date.parse(event.occurred_at) >= now.getTime() - 2 * 86400000,
    )
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  if (missedCheckIn) {
    return {
      risk: 'high',
      action: 'escalate_checkin',
      approvalRequired: true,
      title: 'Wellbeing check-in needs review',
      rationale:
        'A recent caregiver record says the care recipient could not be reached.',
      recommendation:
        'Ask an authorized caregiver to review the check-in and choose the next non-clinical contact step.',
      evidence: [missedCheckIn.title, missedCheckIn.detail],
    };
  }

  const dueTimes = new Map<string, CareTask[]>();
  for (const task of open) {
    const key = Number.isFinite(Date.parse(task.due_at)) ? task.due_at : '';
    if (key) dueTimes.set(key, [...(dueTimes.get(key) ?? []), task]);
  }
  const conflict = [...dueTimes.values()].find((items) => items.length > 1);
  if (conflict) {
    return {
      risk: 'medium',
      action: 'resolve_conflict',
      approvalRequired: false,
      title: 'Care schedule has a conflict',
      rationale: 'Two open responsibilities are scheduled for the same time.',
      recommendation:
        'Review validated alternative times before proposing a calendar change.',
      evidence: conflict.map((task) => task.title),
    };
  }

  const unavailable = events
    .filter(
      (event) =>
        event.type === 'availability' &&
        /unavailable|cannot|can not|not available/i.test(
          `${event.title} ${event.detail}`,
        ),
    )
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  const unavailableTask = unavailable
    ? open.find(
        (task) =>
          task.owner !== 'Unassigned' &&
          `${unavailable.title} ${unavailable.detail}`
            .toLowerCase()
            .includes(task.owner.toLowerCase()),
      )
    : undefined;
  if (unavailable && unavailableTask) {
    return {
      risk: 'medium',
      action: 'reassign_owner',
      approvalRequired: false,
      title: 'Assigned caregiver is unavailable',
      rationale:
        'A recent availability update conflicts with an assigned responsibility.',
      recommendation: `Review coverage for ${unavailableTask.title}.`,
      evidence: [unavailableTask.title, unavailable.title, unavailable.detail],
    };
  }

  const unownedTask = open.find((task) => task.owner === 'Unassigned');
  if (unownedTask) {
    return {
      risk: 'medium',
      action: 'assign_owner',
      approvalRequired: false,
      title: 'Responsibility has no owner',
      rationale: 'An upcoming care task is still unassigned.',
      recommendation: `Assign an owner for ${unownedTask.title}.`,
      evidence: [unownedTask.title, unownedTask.due_at],
    };
  }

  const overdue = open.find((task) => Date.parse(task.due_at) < now.getTime());
  if (overdue)
    return {
      risk: 'medium',
      action: 'review_overdue',
      approvalRequired: false,
      title: 'Responsibility is overdue',
      rationale: 'The recorded deadline has passed without completion.',
      recommendation: `Review ${overdue.title} with ${overdue.owner}.`,
      evidence: [overdue.title, overdue.due_at],
    };

  const reviewDueMemory = memories.find(
    (memory) => memory.status === 'review_due',
  );
  if (reviewDueMemory) {
    return {
      risk: 'low',
      action: 'review_memory',
      approvalRequired: false,
      title: 'A stored fact needs review',
      rationale:
        'A source-linked fact is not verified and should not silently guide care coordination.',
      recommendation: 'Review or archive the unverified fact.',
      evidence: ['Task ownership check', reviewDueMemory.value],
    };
  }
  return {
    risk: 'low',
    action: 'monitor',
    approvalRequired: false,
    title: 'No urgent coordination gaps found',
    rationale:
      'Current responsibilities have owners and no overdue medication action is open.',
    recommendation: 'Continue monitoring the shared care plan.',
    evidence: ['Task ownership check', 'Medication completion check'],
  };
}
