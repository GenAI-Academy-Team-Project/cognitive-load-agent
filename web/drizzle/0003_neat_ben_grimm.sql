CREATE TABLE `care_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`template_key` text NOT NULL,
	`template_version` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`activated_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plans_recipient_status` ON `care_plans` (`recipient_id`,`status`);--> statement-breakpoint
CREATE TABLE `care_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`display_name` text NOT NULL,
	`timezone` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_recipients_household` ON `care_recipients` (`household_id`);--> statement-breakpoint
CREATE TABLE `plan_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`field` text NOT NULL,
	`value` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_overrides_plan` ON `plan_overrides` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_key` text NOT NULL,
	`version` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_template_key_version` ON `plan_templates` (`template_key`,`version`);--> statement-breakpoint
CREATE TABLE `recipient_members` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`access_role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_recipient_member` ON `recipient_members` (`recipient_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `idx_recipient_members_member` ON `recipient_members` (`member_id`);--> statement-breakpoint
CREATE TABLE `record_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`plan_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_scope_entity` ON `record_scopes` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_scope_recipient_type` ON `record_scopes` (`recipient_id`,`entity_type`);--> statement-breakpoint
CREATE TABLE `template_responsibilities` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`cadence` text NOT NULL,
	`owner_role` text NOT NULL,
	`due_offset_days` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_template_tasks_template` ON `template_responsibilities` (`template_id`);--> statement-breakpoint
CREATE TABLE `template_risk_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`name` text NOT NULL,
	`condition_text` text NOT NULL,
	`severity` text NOT NULL,
	`approval_required` text NOT NULL,
	`expected_outcome` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_template_rules_template` ON `template_risk_rules` (`template_id`);