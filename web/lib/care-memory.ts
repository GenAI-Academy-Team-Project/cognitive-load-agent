import { currentMemories } from './current-memories';
import { AppError } from './guardrails';
import type { MemoryRecord } from './types';

export type MemoryConfig = { MEM0_API_KEY?: string };
type Integration = { recipient_id: string; scope_id: string; enabled: string; fingerprint: string; remote_dirty: string; deletion_event: string | null };
const unavailable = () => new AppError('memory_unavailable', 503, 'External memory is unavailable. Local recall still works; retry external cleanup before completing this change.');

// Explicit statements only. The review card preserves the user's words, including negation.
export function memoryCandidate(message: string): string | null {
  if (/\b(?:do not|don’t|don't|never) (?:save|remember)\b/i.test(message)) return null;
  if (/\?|^(?:what|when|where|why|who|how|does|do|can|could|should|is|are)\b/i.test(message.trim())) return null;
  const explicit = message.match(/^(?:please\s+)?(?:remember(?:\s+that)?|save (?:this )?(?:as a )?(?:trusted )?fact)\s*[:,-]?\s+(.+)$/i);
  const value = explicit?.[1] || (/\b(?:prefers?|dislikes?|usually|unavailable|avoid stairs)\b/i.test(message) ? message : '');
  return value.trim().length >= 8 ? value.trim().slice(0, 1200) : null;
}

export async function integrationFor(db: D1Database, recipientId: string) {
  return db.prepare('SELECT * FROM memory_integrations WHERE recipient_id=?').bind(recipientId).first<Integration>();
}

// A database lease serializes provider writes, consent changes and deletion across Workers.
export async function memoryLease(db: D1Database, recipientId: string) {
  const now = new Date().toISOString(), token = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO memory_integrations (recipient_id,scope_id,updated_at) VALUES (?,?,?)').bind(recipientId, crypto.randomUUID(), now).run();
  const result = await db.prepare('UPDATE memory_integrations SET lock_token=?,lock_until=? WHERE recipient_id=? AND (lock_until IS NULL OR lock_until<?)').bind(token, new Date(Date.now() + 120000).toISOString(), recipientId, now).run();
  if (!result.meta.changes) throw new AppError('memory_busy', 409, 'A memory operation is in progress. Please retry shortly.');
  return async () => { await db.prepare('UPDATE memory_integrations SET lock_token=NULL,lock_until=NULL WHERE recipient_id=? AND lock_token=?').bind(recipientId, token).run(); };
}

async function api(config: MemoryConfig, path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!config.MEM0_API_KEY) throw unavailable();
  try {
    const response = await fetch(`https://api.mem0.ai${path}`, {
      method, headers: { Authorization: `Token ${config.MEM0_API_KEY}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw unavailable();
    return await response.json() as Record<string, unknown>;
  } catch { throw unavailable(); }
}

// Caller holds the lease. Never equate a queued provider deletion with completed deletion.
export async function clearRemoteMemory(db: D1Database, config: MemoryConfig, recipientId: string) {
  const integration = await integrationFor(db, recipientId);
  if (!integration || integration.remote_dirty !== 'true') return;
  let event = integration.deletion_event;
  if (!event) {
    const result = await api(config, `/v1/memories/?user_id=${encodeURIComponent(integration.scope_id)}`, 'DELETE');
    if (typeof result.event_id !== 'string' || !result.event_id) throw unavailable();
    event = result.event_id;
    await db.prepare('UPDATE memory_integrations SET deletion_event=?,fingerprint=? WHERE recipient_id=?').bind(event, '', recipientId).run();
  }
  const result = await api(config, `/v1/event/${encodeURIComponent(event)}/`, 'GET');
  if (result.status === 'FAILED') {
    await db.prepare('UPDATE memory_integrations SET deletion_event=NULL WHERE recipient_id=?').bind(recipientId).run();
    throw unavailable();
  }
  if (result.status !== 'SUCCEEDED') throw new AppError('memory_cleanup_pending', 409, 'External memory cleanup is pending. Please retry shortly to finish this change.');
  // Rotate after cleanup: a late response can never populate a subsequently reused scope.
  await db.prepare("UPDATE memory_integrations SET remote_dirty='false',deletion_event=NULL,fingerprint='',scope_id=? WHERE recipient_id=?").bind(crypto.randomUUID(), recipientId).run();
}

export async function setMemoryEnabled(db: D1Database, config: MemoryConfig, recipientId: string, enabled: boolean) {
  if (enabled && (await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>())?.status !== 'active') throw new AppError('consent_inactive', 409, 'Consent is withdrawn.');
  if (enabled && !config.MEM0_API_KEY) throw new AppError('memory_not_configured', 409, 'External memory has not been configured for this deployment.');
  // Disable first so cleanup failures never leave external recall enabled.
  await db.prepare('UPDATE memory_integrations SET enabled=?,updated_at=? WHERE recipient_id=?').bind(enabled ? 'true' : 'false', new Date().toISOString(), recipientId).run();
  if (!enabled) await clearRemoteMemory(db, config, recipientId);
}

export async function verifiedMemories(db: D1Database, recipientId: string) {
  return currentMemories(db, recipientId);
}

export function localMemoryRecall(query: string, memories: MemoryRecord[]) {
  const stop = new Set(['what', 'that', 'with', 'does', 'have', 'about', 'remember', 'please', 'this', 'there', 'their']);
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !stop.has(word));
  return memories.filter((m) => m.status === 'verified').map((memory) => ({ memory, score: terms.filter((term) => memory.value.toLowerCase().includes(term)).length }))
    .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((hit) => hit.memory);
}

// Results contribute IDs only. Provider text is never trusted as a current care fact.
export function resolveMemoryHits(results: unknown, current: MemoryRecord[]) {
  if (!Array.isArray(results)) return [];
  const ids = new Set<string>();
  const memories: MemoryRecord[] = [];
  for (const hit of results) {
    if (!hit || typeof hit !== 'object' || typeof hit.score !== 'number' || hit.score < 0.35) continue;
    const record = current.find((m) => m.status === 'verified' && m.id === hit.metadata?.record_id && m.updated_at === hit.metadata?.revision);
    if (record && !ids.has(record.id)) { ids.add(record.id); memories.push(record); }
  }
  return memories.slice(0, 5);
}

export async function recallMemory(db: D1Database, config: MemoryConfig, recipientId: string, query: string): Promise<{ memories: MemoryRecord[]; mode: 'local' | 'semantic' | 'fallback' }> {
  const current = await verifiedMemories(db, recipientId);
  const local = localMemoryRecall(query, current);
  const integration = await integrationFor(db, recipientId);
  if (integration?.enabled !== 'true') return { memories: local, mode: 'local' };
  let release: (() => Promise<void>) | undefined;
  try {
    release = await memoryLease(db, recipientId);
    const consent = await db.prepare('SELECT status FROM consent_records WHERE recipient_id=?').bind(recipientId).first<{ status: string }>();
    if (consent?.status !== 'active' || (await integrationFor(db, recipientId))?.enabled !== 'true') return { memories: [], mode: 'local' };
    const fresh = await verifiedMemories(db, recipientId);
    // Bound this pilot's indexing cost. Local recall still searches all verified facts.
    const indexed = fresh.slice(0, 50);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(indexed)));
    const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    let active = (await integrationFor(db, recipientId))!;
    if (active.fingerprint !== fingerprint) {
      await clearRemoteMemory(db, config, recipientId);
      active = (await integrationFor(db, recipientId))!;
      // Persist before network IO, including ambiguous timeouts and partial uploads.
      if (indexed.length) await db.prepare("UPDATE memory_integrations SET remote_dirty='true' WHERE recipient_id=?").bind(recipientId).run();
      const writes = await Promise.allSettled(indexed.map((memory) => api(config, '/v3/memories/add/', 'POST', {
        user_id: active.scope_id, infer: false, messages: [{ role: 'user', content: memory.value }],
        metadata: { record_id: memory.id, revision: memory.updated_at },
      }).then((result) => { if (!Array.isArray(result.results) || result.status === 'PENDING' || result.status === 'FAILED') throw unavailable(); })));
      if (writes.some((write) => write.status === 'rejected')) throw unavailable();
      await db.prepare('UPDATE memory_integrations SET fingerprint=? WHERE recipient_id=?').bind(fingerprint, recipientId).run();
    }
    if (!indexed.length) return { memories: [], mode: 'semantic' };
    const result = await api(config, '/v3/memories/search/', 'POST', { query, filters: { user_id: active.scope_id }, top_k: 5 });
    if (!Array.isArray(result.results)) throw unavailable();
    const hits = resolveMemoryHits(result.results, await verifiedMemories(db, recipientId));
    return { memories: [...hits, ...localMemoryRecall(query, fresh).filter((m) => !hits.some((hit) => hit.id === m.id))].slice(0, 5), mode: 'semantic' };
  } catch {
    return { memories: localMemoryRecall(query, await verifiedMemories(db, recipientId)), mode: 'fallback' };
  } finally { await release?.(); }
}
