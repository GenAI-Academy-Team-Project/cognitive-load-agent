import { evaluateCareState } from "@/lib/risk-engine";
import type { CareEvent, CareTask, MemoryRecord } from "@/lib/types";

export async function runCareAgent(
  tasks: CareTask[],
  events: CareEvent[],
  memories: MemoryRecord[],
) {
  return {
    decision: evaluateCareState(tasks, events, memories),
    mode: "deterministic" as const,
  };
}
