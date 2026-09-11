CREATE TABLE `consent_records` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`purpose` text NOT NULL,
	`retention_days` text NOT NULL,
	`granted_by` text NOT NULL,
	`granted_at` text,
	`withdrawn_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `data_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`request_type` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_data_requests_recipient_created` ON `data_requests` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `error_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`route` text NOT NULL,
	`action` text NOT NULL,
	`error_code` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`recipient_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_error_events_created` ON `error_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`approval_id` text,
	`delivery_state` text NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_recipient_state` ON `notifications` (`recipient_id`,`delivery_state`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_actor_action_time` ON `rate_limit_events` (`actor_user_id`,`action`,`created_at`);