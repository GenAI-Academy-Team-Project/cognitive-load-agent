CREATE TABLE `onesignal_identities` (
	`member_id` text NOT NULL,
	`app_id` text NOT NULL,
	`external_id` text NOT NULL,
	PRIMARY KEY(`member_id`, `app_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `onesignal_identities_external_id_unique` ON `onesignal_identities` (`external_id`);--> statement-breakpoint
CREATE TABLE `onesignal_push_subscriptions` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`app_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`platform` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`, `app_id`, `subscription_id`)
);
