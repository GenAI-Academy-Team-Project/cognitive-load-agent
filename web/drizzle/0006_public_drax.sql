CREATE TABLE `chat_action_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`actor_member_id` text NOT NULL,
	`action_type` text NOT NULL,
	`summary` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text NOT NULL,
	`requires_approval` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`executed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_chat_actions_recipient_status` ON `chat_action_requests` (`recipient_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`evidence_json` text NOT NULL,
	`action_request_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_thread_time` ON `chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_thread_recipient_member` ON `chat_threads` (`recipient_id`,`member_id`);--> statement-breakpoint
PRAGMA optimize;
