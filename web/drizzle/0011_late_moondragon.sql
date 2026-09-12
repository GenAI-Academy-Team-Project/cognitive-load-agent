CREATE TABLE `appointment_notes` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`task_id` text NOT NULL,
	`questions` text NOT NULL,
	`follow_up` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`, `task_id`)
);
--> statement-breakpoint
CREATE TABLE `attention_settings` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`daily_minutes` integer NOT NULL,
	`digest_hour` integer NOT NULL,
	`focus_mode` integer NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
--> statement-breakpoint
CREATE TABLE `care_preferences` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`memory_id` text NOT NULL,
	`memory_value` text NOT NULL,
	`start_hour` integer NOT NULL,
	`end_hour` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_routines` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`every_days` integer NOT NULL,
	`next_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_care_routines_recipient` ON `care_routines` (`recipient_id`);--> statement-breakpoint
CREATE TABLE `generated_batches` (
	`recipient_id` text NOT NULL,
	`source_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `source_key`)
);
