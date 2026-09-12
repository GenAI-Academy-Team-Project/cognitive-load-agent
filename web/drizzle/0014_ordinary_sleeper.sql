CREATE TABLE `recipient_locks` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`lock_token` text,
	`lock_until` text
);
--> statement-breakpoint
DROP TABLE `memory_integrations`;
--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'integration:memory';
