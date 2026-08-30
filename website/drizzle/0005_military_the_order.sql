CREATE TABLE `customer_binance_connections` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`credential_ciphertext` text NOT NULL,
	`credential_iv` text NOT NULL,
	`key_version` integer DEFAULT 1 NOT NULL,
	`api_key_hint` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`account_equity` text,
	`connected_at` integer NOT NULL,
	`last_verified_at` integer NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_binance_status_idx` ON `customer_binance_connections` (`status`);--> statement-breakpoint
CREATE TABLE `customer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`license_id` text NOT NULL,
	`device_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`license_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sessions_token_unique` ON `customer_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `customer_sessions_license_device_unique` ON `customer_sessions` (`license_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `customer_sessions_expiry_idx` ON `customer_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `tenant_trading_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`level` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_trading_events_tenant_created_idx` ON `tenant_trading_events` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_trading_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`symbol` text DEFAULT 'BTCUSDT' NOT NULL,
	`interval` text DEFAULT '1h' NOT NULL,
	`risk_bps` integer DEFAULT 25 NOT NULL,
	`daily_loss_bps` integer DEFAULT 100 NOT NULL,
	`leverage` integer DEFAULT 2 NOT NULL,
	`max_notional_usdt` integer DEFAULT 250 NOT NULL,
	`min_research_confidence` integer DEFAULT 60 NOT NULL,
	`cooldown_minutes` integer DEFAULT 1920 NOT NULL,
	`research_minutes` integer DEFAULT 30 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_trading_enabled_idx` ON `tenant_trading_settings` (`enabled`);--> statement-breakpoint
CREATE TABLE `tenant_trading_state` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`day_key` text,
	`daily_baseline_equity` text,
	`paused_reason` text,
	`last_error` text,
	`last_cycle_at` integer,
	`last_research_at` integer,
	`last_trade_at` integer,
	`cycle_lock_until` integer DEFAULT 0 NOT NULL,
	`active_entry_client_id` text,
	`active_entry_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `licenses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_trading_due_idx` ON `tenant_trading_state` (`last_cycle_at`,`cycle_lock_until`);