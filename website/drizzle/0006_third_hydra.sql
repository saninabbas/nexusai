ALTER TABLE `tenant_trading_state` ADD `active_position_amount` text;--> statement-breakpoint
ALTER TABLE `tenant_trading_state` ADD `active_stop_client_id` text;--> statement-breakpoint
ALTER TABLE `tenant_trading_state` ADD `active_take_profit_client_id` text;--> statement-breakpoint
ALTER TABLE `trading_state` ADD `active_position_amount` text;--> statement-breakpoint
ALTER TABLE `trading_state` ADD `active_stop_client_id` text;--> statement-breakpoint
ALTER TABLE `trading_state` ADD `active_take_profit_client_id` text;