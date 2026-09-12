CREATE TABLE `caregiver_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`categories_json` text NOT NULL,
	`capabilities_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_availability_recipient` ON `caregiver_availability` (`recipient_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `coverage_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`task_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_pending_coverage_task` ON `coverage_offers` (`task_id`) WHERE "coverage_offers"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `handover_checkpoints` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`acknowledged_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
--> statement-breakpoint
CREATE TABLE `memory_facts` (
	`memory_id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`subject` text NOT NULL,
	`attribute` text NOT NULL,
	`valid_until` text NOT NULL,
	`superseded_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memory_facts_recipient` ON `memory_facts` (`recipient_id`);--> statement-breakpoint
CREATE TABLE `planning_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "planning_guard_valid" CHECK("planning_guards"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `planning_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_planning_proposals_recipient` ON `planning_proposals` (`recipient_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_planning` (
	`task_id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`owner_member_id` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`depends_on` text NOT NULL,
	`backup_member_id` text NOT NULL,
	`requirements_json` text NOT NULL,
	`accepted_signature` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_task_planning_recipient` ON `task_planning` (`recipient_id`);