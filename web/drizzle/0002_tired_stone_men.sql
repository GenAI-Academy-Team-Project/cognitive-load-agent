CREATE INDEX `idx_audit_created_at` ON `audit_entries` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_care_circle_user_id` ON `care_circle_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_care_circle_email` ON `care_circle_members` (`email`);