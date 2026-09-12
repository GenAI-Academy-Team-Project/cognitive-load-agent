CREATE TABLE `memory_integrations` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`enabled` text DEFAULT 'false' NOT NULL,
	`fingerprint` text DEFAULT '' NOT NULL,
	`remote_dirty` text DEFAULT 'false' NOT NULL,
	`deletion_event` text,
	`lock_token` text,
	`lock_until` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_integrations_scope_id_unique` ON `memory_integrations` (`scope_id`);