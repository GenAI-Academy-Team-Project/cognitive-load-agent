CREATE TABLE `notification_dismissals` (
	`notification_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`notification_id`, `member_id`)
);
