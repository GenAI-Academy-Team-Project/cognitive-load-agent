import { currentMemories } from './current-memories';
import type { MemoryRecord } from './types';

// Explicit statements only. The review card preserves the user's words, including negation.
export function memoryCandidate(message: string): string | null {
  if (/\b(?:do not|don’t|don't|never) (?:save|remember)\b/i.test(message)) return null;
  if (/\?|^(?:what|when|where|why|who|how|does|do|can|could|should|is|are)\b/i.test(message.trim())) return null;
  const explicit = message.match(/^(?:please\s+)?(?:remember(?:\s+that)?|save (?:this )?(?:as a )?(?:trusted )?fact)\s*[:,-]?\s+(.+)$/i);
  const value = explicit?.[1] || (/\b(?:prefers?|dislikes?|usually|unavailable|avoid stairs)\b/i.test(message) ? message : '');
  return value.trim().length >= 8 ? value.trim().slice(0, 1200) : null;
}

export function localMemoryRecall(query: string, memories: MemoryRecord[]) {
  const stop = new Set(['what', 'that', 'with', 'does', 'have', 'about', 'remember', 'please', 'this', 'there', 'their']);
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !stop.has(word));
  return memories.filter((m) => m.status === 'verified').map((memory) => ({ memory, score: terms.filter((term) => memory.value.toLowerCase().includes(term)).length }))
    .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((hit) => hit.memory);
}

export async function recallMemory(db: D1Database, recipientId: string, query: string) {
  return { memories: localMemoryRecall(query, await currentMemories(db, recipientId)) };
}
