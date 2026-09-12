import type { CareEvent, CareTask, MemoryRecord } from "./types";

export type AgentDecision = {
  risk: "high" | "medium" | "low";
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
  const open = tasks.filter((task) => task.status !== 'complete' && task.status !== 'archived');
  const medicationTask = open.filter((task) => task.category === 'medication' && Number.isFinite(Date.parse(task.due_at)) && Date.parse(task.due_at) <= now.getTime() + 24 * 3600000).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))[0];
  const refillMemory = memories.find((memory) => memory.kind === "medication" && memory.status === "verified");
  const recentMedicationEvent = events.filter((event) => event.type === "medication" && Date.parse(event.occurred_at) <= now.getTime() && Date.parse(event.occurred_at) >= now.getTime() - 7 * 86400000).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];

  if (medicationTask) {
    return {
      risk: "high",
      title: "Medication pickup may be missed",
      rationale:
        "An open medication responsibility is close to its due time and no completed pickup is recorded.",
      recommendation:
        `Confirm the pharmacy refill and review pickup coverage${medicationTask.owner !== "Unassigned" ? ` with ${medicationTask.owner}` : " with an available caregiver"}. Request acceptance before treating it as covered.`,
      evidence: [
        medicationTask.title,
        refillMemory?.value ?? "No verified refill preference",
        recentMedicationEvent?.detail ?? "No recent medication event",
      ],
    };
  }

  const unownedTask = open.find((task) => task.owner === "Unassigned");
  if (unownedTask) {
    return {
      risk: "medium",
      title: "Responsibility has no owner",
      rationale: "An upcoming care task is still unassigned.",
      recommendation: `Assign an owner for ${unownedTask.title}.`,
      evidence: [unownedTask.title, unownedTask.due_at],
    };
  }

  const overdue = open.find((task) => Date.parse(task.due_at) < now.getTime());
  if (overdue) return { risk: 'medium', title: 'Responsibility is overdue', rationale: 'The recorded deadline has passed without completion.', recommendation: `Review ${overdue.title} with ${overdue.owner}.`, evidence: [overdue.title, overdue.due_at] };
  return {
    risk: "low",
    title: "No urgent coordination gaps found",
    rationale: "Current responsibilities have owners and no overdue medication action is open.",
    recommendation: "Continue monitoring the shared care plan.",
    evidence: ["Task ownership check", "Medication completion check"],
  };
}
