import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";
import { runCareAgent } from "@/agent/orchestrator";
import type {
  Approval,
  CareEvent,
  CareTask,
  DashboardState,
  MemoryRecord,
  Risk,
  Trace,
} from "@/lib/types";

export const runtime = "edge";

async function rows<T>(db: D1Database, statement: string) {
  const result = await db.prepare(statement).all<T>();
  return result.results;
}

async function loadState(db: D1Database): Promise<DashboardState> {
  await ensureDatabase(db);
  const [risks, tasks, events, memories, approvals, traces] = await Promise.all([
    rows<Risk>(db, "SELECT * FROM risks ORDER BY CASE severity WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, updated_at DESC"),
    rows<CareTask>(db, "SELECT * FROM tasks ORDER BY due_at ASC"),
    rows<CareEvent>(db, "SELECT * FROM events ORDER BY occurred_at DESC"),
    rows<MemoryRecord>(db, "SELECT * FROM memories ORDER BY updated_at DESC"),
    rows<Approval>(db, "SELECT * FROM approvals ORDER BY created_at DESC"),
    rows<Trace>(db, "SELECT * FROM traces ORDER BY created_at DESC"),
  ]);
  return { risks, tasks, events, memories, approvals, traces, agentMode: "deterministic" };
}

export async function GET() {
  return Response.json(await loadState(env.DB));
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    id?: string;
    title?: string;
    owner?: string;
    dueAt?: string;
    category?: string;
  };
  const db = env.DB;
  await ensureDatabase(db);
  const now = new Date().toISOString();

  if (body.action === "approve_plan" && body.id) {
    const approval = await db
      .prepare("SELECT * FROM approvals WHERE id = ?")
      .bind(body.id)
      .first<Approval>();
    if (!approval) return Response.json({ error: "Approval not found" }, { status: 404 });
    await db.batch([
      db.prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ?").bind("approved", now, body.id),
      db.prepare("UPDATE risks SET status = ?, updated_at = ? WHERE id = ?").bind("resolved", now, approval.risk_id),
      db.prepare("UPDATE tasks SET owner = ?, status = ? WHERE source_risk_id = ? AND category = ?").bind("Maya", "assigned", approval.risk_id, "medication"),
      db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), "action", "Medication plan approved", approval.action, "Carestead", now),
      db.prepare("INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), "Caregiver approval", approval.action, "Assign medication pickup to Maya", "approved by human", "responsibility updater", "Plan recorded", now),
    ]);
  } else if (body.action === "assign_ride") {
    await db.batch([
      db.prepare("UPDATE tasks SET owner = ?, status = ? WHERE id = ?").bind("Maya", "assigned", "task-ride"),
      db.prepare("UPDATE risks SET status = ?, updated_at = ? WHERE id = ?").bind("resolved", now, "risk-ride"),
      db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), "transport", "Physio ride assigned", "Maya will drive Alex to physiotherapy.", "Carestead", now),
      db.prepare("INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), "Caregiver action", "Open ride responsibility", "Assign Maya as driver", "allowed", "responsibility updater", "Ride risk resolved", now),
    ]);
  } else if (body.action === "complete_task" && body.id) {
    await db.batch([
      db.prepare("UPDATE tasks SET status = ? WHERE id = ?").bind("complete", body.id),
      db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), "task", "Responsibility completed", `Task ${body.id} was marked complete.`, "Carestead", now),
    ]);
  } else if (body.action === "add_task" && body.title && body.dueAt) {
    await db
      .prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        crypto.randomUUID(),
        body.title,
        body.owner || "Unassigned",
        body.dueAt,
        "open",
        body.category || "general",
        null,
      )
      .run();
  } else if (body.action === "run_check") {
    const state = await loadState(db);
    const { decision } = await runCareAgent(state.tasks, state.events, state.memories);
    await db.batch([
      db.prepare("INSERT INTO traces VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
        crypto.randomUUID(),
        "Manual care-state check",
        decision.evidence.join(" • "),
        `${decision.title}: ${decision.recommendation}`,
        decision.risk === "high" ? "human approval required" : "allowed",
        "care-state rules",
        "Check completed",
        now,
      ),
      db.prepare("INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)").bind(
        crypto.randomUUID(),
        "agent",
        "Care plan checked",
        decision.rationale,
        "Carestead agent",
        now,
      ),
    ]);
  } else {
    return Response.json({ error: "Unsupported action" }, { status: 400 });
  }

  return Response.json(await loadState(db));
}
