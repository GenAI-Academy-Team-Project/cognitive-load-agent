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
): AgentDecision {
  const medicationTask = tasks.find(
    (task) => task.category === "medication" && task.status !== "complete",
  );
  const refillMemory = memories.find((memory) => memory.kind === "medication");
  const recentMedicationEvent = events.find((event) => event.type === "medication");

  if (medicationTask) {
    return {
      risk: "high",
      title: "Medication pickup may be missed",
      rationale:
        "An open medication responsibility is close to its due time and no completed pickup is recorded.",
      recommendation:
        "Confirm the pharmacy refill, ask Maya to pick it up, and notify Alex only after approval.",
      evidence: [
        medicationTask.title,
        refillMemory?.value ?? "No verified refill preference",
        recentMedicationEvent?.detail ?? "No recent medication event",
      ],
    };
  }

  const unownedTask = tasks.find(
    (task) => task.owner === "Unassigned" && task.status !== "complete",
  );
  if (unownedTask) {
    return {
      risk: "medium",
      title: "Responsibility has no owner",
      rationale: "An upcoming care task is still unassigned.",
      recommendation: `Assign an owner for ${unownedTask.title}.`,
      evidence: [unownedTask.title, unownedTask.due_at],
    };
  }

  return {
    risk: "low",
    title: "No urgent coordination gaps found",
    rationale: "Current responsibilities have owners and no overdue medication action is open.",
    recommendation: "Continue monitoring the shared care plan.",
    evidence: ["Task ownership check", "Medication completion check"],
  };
}
