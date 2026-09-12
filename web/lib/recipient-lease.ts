import { AppError } from './guardrails';

// Serialize care changes, consent updates, and delivery approvals across Workers.
export async function recipientLease(db: D1Database, recipientId: string) {
  const now = new Date().toISOString(), token = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO recipient_locks (recipient_id) VALUES (?)').bind(recipientId).run();
  const result = await db.prepare('UPDATE recipient_locks SET lock_token=?,lock_until=? WHERE recipient_id=? AND (lock_until IS NULL OR lock_until<?)').bind(token, new Date(Date.now() + 120000).toISOString(), recipientId, now).run();
  if (!result.meta.changes) throw new AppError('recipient_busy', 409, 'A care update is in progress. Please retry shortly.');
  return async () => { await db.prepare('UPDATE recipient_locks SET lock_token=NULL,lock_until=NULL WHERE recipient_id=? AND lock_token=?').bind(recipientId, token).run(); };
}
