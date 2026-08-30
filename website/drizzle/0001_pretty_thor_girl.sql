CREATE TABLE `trading_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trading_events_created_idx` ON `trading_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `trading_research` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`bias` text NOT NULL,
	`risk_level` text NOT NULL,
	`sentiment` text NOT NULL,
	`confidence` integer NOT NULL,
	`summary` text NOT NULL,
	`catalysts_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trading_research_created_idx` ON `trading_research` (`created_at`);--> statement-breakpoint
CREATE TABLE `trading_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`symbol` text DEFAULT 'BTCUSDT' NOT NULL,
	`interval` text DEFAULT '15m' NOT NULL,
	`risk_bps` integer DEFAULT 25 NOT NULL,
	`daily_loss_bps` integer DEFAULT 100 NOT NULL,
	`leverage` integer DEFAULT 2 NOT NULL,
	`max_notional_usdt` integer DEFAULT 250 NOT NULL,
	`min_research_confidence` integer DEFAULT 60 NOT NULL,
	`cooldown_minutes` integer DEFAULT 240 NOT NULL,
	`research_minutes` integer DEFAULT 30 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trading_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`day_key` text,
	`daily_baseline_equity` text,
	`paused_reason` text,
	`last_error` text,
	`last_cycle_at` integer,
	`last_research_at` integer,
	`last_trade_at` integer,
	`cycle_lock_until` integer DEFAULT 0 NOT NULL,
	`active_entry_client_id` text,
	`updated_at` integer NOT NULL
);
