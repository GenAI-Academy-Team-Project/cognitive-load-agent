CREATE TABLE `auth_password_resets` (
	`account_id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`password_hash` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_password_resets_token_hash_unique` ON `auth_password_resets` (`token_hash`);