PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trading_settings` (
	`id` integer PRIMARY KEY NOT NULL,
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_trading_settings`("id", "enabled", "symbol", "interval", "risk_bps", "daily_loss_bps", "leverage", "max_notional_usdt", "min_research_confidence", "cooldown_minutes", "research_minutes", "updated_at") SELECT "id", "enabled", "symbol", "interval", "risk_bps", "daily_loss_bps", "leverage", "max_notional_usdt", "min_research_confidence", "cooldown_minutes", "research_minutes", "updated_at" FROM `trading_settings`;--> statement-breakpoint
DROP TABLE `trading_settings`;--> statement-breakpoint
ALTER TABLE `__new_trading_settings` RENAME TO `trading_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;