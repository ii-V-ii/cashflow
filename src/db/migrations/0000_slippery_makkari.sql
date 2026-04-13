CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"current_balance" integer DEFAULT 0 NOT NULL,
	"color" text,
	"icon" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"date" text NOT NULL,
	"value" integer NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"memo" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "uq_asset_valuations_asset_date" UNIQUE("asset_id","date")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"asset_category_id" text,
	"acquisition_date" text NOT NULL,
	"acquisition_cost" integer NOT NULL,
	"current_value" integer NOT NULL,
	"account_id" text,
	"institution" text,
	"memo" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_items" (
	"id" text PRIMARY KEY NOT NULL,
	"budget_id" text NOT NULL,
	"category_id" text NOT NULL,
	"planned_amount" integer NOT NULL,
	"memo" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budget_items_budget_category" UNIQUE("budget_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer,
	"total_income" integer DEFAULT 0 NOT NULL,
	"total_expense" integer DEFAULT 0 NOT NULL,
	"memo" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "uq_budgets_year_month" UNIQUE("year","month")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"icon" text,
	"color" text,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_results" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"date" text NOT NULL,
	"projected_income" integer NOT NULL,
	"projected_expense" integer NOT NULL,
	"projected_balance" integer NOT NULL,
	"projected_net_worth" integer NOT NULL,
	"details" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "uq_forecast_results_scenario_date" UNIQUE("scenario_id","date")
);
--> statement-breakpoint
CREATE TABLE "forecast_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"assumptions" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_returns" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"invested_amount" integer DEFAULT 0 NOT NULL,
	"dividend_income" integer DEFAULT 0 NOT NULL,
	"realized_gain" integer DEFAULT 0 NOT NULL,
	"unrealized_gain" integer DEFAULT 0 NOT NULL,
	"return_rate" real DEFAULT 0,
	"memo" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "uq_investment_returns_asset_year_month" UNIQUE("asset_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"next_date" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transaction_tags" (
	"transaction_id" text NOT NULL,
	"tag_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"date" text NOT NULL,
	"memo" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_category_id_asset_categories_id_fk" FOREIGN KEY ("asset_category_id") REFERENCES "public"."asset_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_results" ADD CONSTRAINT "forecast_results_scenario_id_forecast_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."forecast_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_returns" ADD CONSTRAINT "investment_returns_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_type" ON "accounts" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_asset_valuations_asset_id" ON "asset_valuations" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_asset_valuations_date" ON "asset_valuations" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_assets_type" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_assets_category" ON "assets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_assets_asset_category_id" ON "assets" USING btree ("asset_category_id");--> statement-breakpoint
CREATE INDEX "idx_assets_account_id" ON "assets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_assets_is_active" ON "assets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_budget_items_budget_id" ON "budget_items" USING btree ("budget_id");--> statement-breakpoint
CREATE INDEX "idx_budget_items_category_id" ON "budget_items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_budgets_year" ON "budgets" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_categories_type" ON "categories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_categories_parent_id" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_forecast_results_scenario_id" ON "forecast_results" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "idx_forecast_results_date" ON "forecast_results" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_investment_returns_asset_id" ON "investment_returns" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_investment_returns_year_month" ON "investment_returns" USING btree ("year","month");--> statement-breakpoint
CREATE INDEX "idx_recurring_transactions_next_date" ON "recurring_transactions" USING btree ("next_date");--> statement-breakpoint
CREATE INDEX "idx_recurring_transactions_is_active" ON "recurring_transactions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_recurring_transactions_account_id" ON "recurring_transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_tags_transaction_id" ON "transaction_tags" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_tags_tag_id" ON "transaction_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_type" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_transactions_account_id" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_category_id" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_date" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_transactions_to_account_id" ON "transactions" USING btree ("to_account_id");