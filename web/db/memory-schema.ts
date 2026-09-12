export const memorySchema = [
  `CREATE TABLE IF NOT EXISTS memory_integrations (recipient_id TEXT PRIMARY KEY, scope_id TEXT NOT NULL UNIQUE, enabled TEXT NOT NULL DEFAULT 'false', fingerprint TEXT NOT NULL DEFAULT '', remote_dirty TEXT NOT NULL DEFAULT 'false', deletion_event TEXT, lock_token TEXT, lock_until TEXT, updated_at TEXT NOT NULL)`,
];
