CREATE TABLE `recipient_profiles` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`preferred_name` text NOT NULL,
	`pronouns` text NOT NULL,
	`care_context` text NOT NULL,
	`communication_notes` text NOT NULL,
	`mobility_notes` text NOT NULL,
	`home_base` text NOT NULL,
	`emergency_plan` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `support_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`contact_type` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`organization` text NOT NULL,
	`notes` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_support_contacts_recipient_status` ON `support_contacts` (`recipient_id`,`status`);