CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`risk_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`source` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`confidence` text NOT NULL,
	`rationale` text NOT NULL,
	`proposed_action` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`owner` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text NOT NULL,
	`category` text NOT NULL,
	`source_risk_id` text
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`evidence` text NOT NULL,
	`decision` text NOT NULL,
	`policy_status` text NOT NULL,
	`tool` text NOT NULL,
	`outcome` text NOT NULL,
	`created_at` text NOT NULL
);
