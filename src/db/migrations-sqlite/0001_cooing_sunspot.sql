CREATE TABLE `budget_items` (
	`id` text PRIMARY KEY NOT NULL,
	`budget_id` text NOT NULL,
	`category_id` text NOT NULL,
	`planned_amount` integer NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_budget_items_budget_id` ON `budget_items` (`budget_id`);--> statement-breakpoint
CREATE INDEX `idx_budget_items_category_id` ON `budget_items` (`category_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budget_items_budget_category` ON `budget_items` (`budget_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer,
	`total_income` integer DEFAULT 0 NOT NULL,
	`total_expense` integer DEFAULT 0 NOT NULL,
	`memo` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_budgets_year` ON `budgets` (`year`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_budgets_year_month` ON `budgets` (`year`,`month`);