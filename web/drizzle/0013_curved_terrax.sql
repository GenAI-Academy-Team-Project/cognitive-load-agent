CREATE TABLE `pushover_preferences` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`user_key` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
