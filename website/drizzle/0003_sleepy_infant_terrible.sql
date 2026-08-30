ALTER TABLE `trading_backtests` ADD `gross_gain_r` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_backtests` ADD `gross_loss_r` text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_backtests` ADD `window_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_backtests` ADD `passed_windows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `trading_state` ADD `active_entry_at` integer;