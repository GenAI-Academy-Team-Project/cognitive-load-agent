CREATE TABLE `notification_history_dismissals` (
	`recipient_id` text NOT NULL,
	`member_id` text NOT NULL,
	`action_id` text NOT NULL,
	PRIMARY KEY(`recipient_id`, `member_id`, `action_id`)
);
