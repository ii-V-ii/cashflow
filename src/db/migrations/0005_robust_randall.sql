ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "investment_returns" ALTER COLUMN "return_rate" SET DATA TYPE numeric(10, 4);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" text DEFAULT 'applied' NOT NULL;--> statement-breakpoint
UPDATE "transactions" SET "status" = 'pending' WHERE "recurring_id" IS NOT NULL AND "date" > CURRENT_DATE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_transactions_status" ON "transactions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "uq_assets_account_id" UNIQUE("account_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "chk_expense_kind" CHECK ("categories"."type" != 'expense' OR "categories"."expense_kind" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "chk_amount_positive" CHECK ("transactions"."amount" > 0);