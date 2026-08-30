CREATE TABLE `trading_backtests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`interval` text NOT NULL,
	`candle_count` integer NOT NULL,
	`trade_count` integer NOT NULL,
	`wins` integer NOT NULL,
	`losses` integer NOT NULL,
	`win_rate` text NOT NULL,
	`net_r` text NOT NULL,
	`max_drawdown_r` text NOT NULL,
	`profit_factor` text NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trading_backtests_created_idx` ON `trading_backtests` (`created_at`);