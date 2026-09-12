CREATE TABLE `ntfy_preferences` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`server_url` text NOT NULL,
	`topic` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
