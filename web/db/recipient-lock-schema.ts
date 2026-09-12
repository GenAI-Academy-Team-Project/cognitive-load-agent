export const recipientLockSchema = [
  `CREATE TABLE IF NOT EXISTS recipient_locks (recipient_id TEXT PRIMARY KEY, lock_token TEXT, lock_until TEXT)`,
];
