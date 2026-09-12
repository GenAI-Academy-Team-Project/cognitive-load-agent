import type { MemoryRecord } from './types';
import type { FactDetails } from './planning-types';
import { memoryConflicts } from './planning-engine';

export async function currentMemories(
  db: D1Database,
  recipientId: string,
): Promise<MemoryRecord[]> {
  const memories = (
    await db
      .prepare(
        "SELECT m.* FROM memories m JOIN record_scopes s ON s.entity_type='memory' AND s.entity_id=m.id WHERE s.recipient_id=? AND m.status!='archived' ORDER BY m.updated_at DESC,m.id",
      )
      .bind(recipientId)
      .all<MemoryRecord>()
  ).results;
  const facts = (
    await db
      .prepare('SELECT * FROM memory_facts WHERE recipient_id=?')
      .bind(recipientId)
      .all<FactDetails>()
  ).results;
  const structured = memories.map((memory) => ({
    ...memory,
    fact: facts.find((fact) => fact.memory_id === memory.id) ?? null,
  }));
  const blocked = new Set(
    memoryConflicts(structured).flatMap((conflict) =>
      conflict.records.map((record) => record.id),
    ),
  );
  return structured.filter(
    (memory) =>
      memory.status === 'verified' &&
      !blocked.has(memory.id) &&
      !memory.fact?.superseded_by &&
      (!memory.fact?.valid_until ||
        Date.parse(memory.fact.valid_until) > Date.now()),
  );
}
