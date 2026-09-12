CREATE TABLE `calendar_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`html_link` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_actions_recipient` ON `calendar_actions` (`recipient_id`,`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `calendar_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`event_id` text NOT NULL,
	`task_id` text NOT NULL,
	`title` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`timezone` text NOT NULL,
	`location` text NOT NULL,
	`attendees_json` text NOT NULL,
	`reminder_minutes` text NOT NULL,
	`status` text NOT NULL,
	`html_link` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_appointments_recipient` ON `calendar_appointments` (`recipient_id`,`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_active_task` ON `calendar_appointments` (`task_id`) WHERE status = 'confirmed';--> statement-breakpoint
CREATE TABLE `calendar_bindings` (
	`member_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`calendar_id` text NOT NULL,
	`calendar_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_calendar_binding_member_recipient` ON `calendar_bindings` (`member_id`,`recipient_id`);--> statement-breakpoint
CREATE TABLE `google_connections` (
	`member_id` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`refresh_token` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_connections_id_unique` ON `google_connections` (`id`);--> statement-breakpoint
CREATE TABLE `google_oauth_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`recipient_id` text NOT NULL,
	`verifier` text NOT NULL,
	`expires_at` text NOT NULL
);
