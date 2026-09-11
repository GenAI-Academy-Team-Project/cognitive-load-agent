CREATE TABLE `audit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_circle_members` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
