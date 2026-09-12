export const notificationSchema = [
  `CREATE TABLE IF NOT EXISTS ntfy_preferences (recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, server_url TEXT NOT NULL, topic TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(recipient_id,member_id))`,
  `CREATE TABLE IF NOT EXISTS notification_preferences (recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, email_enabled INTEGER NOT NULL DEFAULT 0, sms_enabled INTEGER NOT NULL DEFAULT 0, phone TEXT NOT NULL DEFAULT '', push_json TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(recipient_id,member_id))`,
  `CREATE TABLE IF NOT EXISTS notification_deliveries (action_id TEXT PRIMARY KEY, notification_id TEXT NOT NULL UNIQUE, recipient_id TEXT NOT NULL, member_id TEXT NOT NULL, channel TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT, error_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient ON notification_deliveries(recipient_id,created_at)`,
  `CREATE TABLE IF NOT EXISTS notification_reads (notification_id TEXT NOT NULL, member_id TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY(notification_id,member_id))`,
];
