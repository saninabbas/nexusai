CREATE TABLE `licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`license_hash` text NOT NULL,
	`transaction_hash` text NOT NULL,
	`payment_amount` text NOT NULL,
	`device_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`activated_at` integer,
	`last_validated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `licenses_hash_unique` ON `licenses` (`license_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `licenses_transaction_unique` ON `licenses` (`transaction_hash`);