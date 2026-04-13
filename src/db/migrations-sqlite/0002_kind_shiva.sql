CREATE TABLE `asset_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`date` text NOT NULL,
	`value` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_asset_valuations_asset_id` ON `asset_valuations` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_asset_valuations_date` ON `asset_valuations` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_asset_valuations_asset_date` ON `asset_valuations` (`asset_id`,`date`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`category` text NOT NULL,
	`acquisition_date` text NOT NULL,
	`acquisition_cost` integer NOT NULL,
	`current_value` integer NOT NULL,
	`account_id` text,
	`institution` text,
	`memo` text,
	`is_active` integer DEFAULT true NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_type` ON `assets` (`type`);--> statement-breakpoint
CREATE INDEX `idx_assets_category` ON `assets` (`category`);--> statement-breakpoint
CREATE INDEX `idx_assets_account_id` ON `assets` (`account_id`);--> statement-breakpoint
CREATE INDEX `idx_assets_is_active` ON `assets` (`is_active`);--> statement-breakpoint
CREATE TABLE `investment_returns` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`invested_amount` integer DEFAULT 0 NOT NULL,
	`dividend_income` integer DEFAULT 0 NOT NULL,
	`realized_gain` integer DEFAULT 0 NOT NULL,
	`unrealized_gain` integer DEFAULT 0 NOT NULL,
	`return_rate` real DEFAULT 0,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_investment_returns_asset_id` ON `investment_returns` (`asset_id`);--> statement-breakpoint
CREATE INDEX `idx_investment_returns_year_month` ON `investment_returns` (`year`,`month`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_investment_returns_asset_year_month` ON `investment_returns` (`asset_id`,`year`,`month`);