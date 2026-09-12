CREATE TABLE `notification_deliveries` (
	`action_id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`channel` text NOT NULL,
	`destination` text NOT NULL,
	`status` text NOT NULL,
	`provider_id` text,
	`error_code` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_deliveries_notification_id_unique` ON `notification_deliveries` (`notification_id`);--> statement-breakpoint
CREATE INDEX `idx_notification_deliveries_recipient` ON `notification_deliveries` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`email_enabled` integer DEFAULT 0 NOT NULL,
	`sms_enabled` integer DEFAULT 0 NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`push_json` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`notification_id` text NOT NULL,
	`member_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`notification_id`, `member_id`)
);
