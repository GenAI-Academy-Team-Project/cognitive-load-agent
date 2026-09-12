CREATE TABLE `notification_history_clears` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`cleared_before` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`)
);
