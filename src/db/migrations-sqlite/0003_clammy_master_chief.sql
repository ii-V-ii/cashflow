CREATE TABLE `asset_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `forecast_results` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`date` text NOT NULL,
	`projected_income` integer NOT NULL,
	`projected_expense` integer NOT NULL,
	`projected_balance` integer NOT NULL,
	`projected_net_worth` integer NOT NULL,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `forecast_scenarios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_forecast_results_scenario_id` ON `forecast_results` (`scenario_id`);--> statement-breakpoint
CREATE INDEX `idx_forecast_results_date` ON `forecast_results` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_forecast_results_scenario_date` ON `forecast_results` (`scenario_id`,`date`);--> statement-breakpoint
CREATE TABLE `forecast_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`assumptions` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`category_id` text,
	`account_id` text NOT NULL,
	`to_account_id` text,
	`frequency` text NOT NULL,
	`interval` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`next_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_recurring_transactions_next_date` ON `recurring_transactions` (`next_date`);--> statement-breakpoint
CREATE INDEX `idx_recurring_transactions_is_active` ON `recurring_transactions` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_recurring_transactions_account_id` ON `recurring_transactions` (`account_id`);--> statement-breakpoint
ALTER TABLE `assets` ADD `asset_category_id` text REFERENCES asset_categories(id);--> statement-breakpoint
CREATE INDEX `idx_assets_asset_category_id` ON `assets` (`asset_category_id`);