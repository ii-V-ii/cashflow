ALTER TABLE "accounts" ADD COLUMN "billing_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "credit_limit" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "linked_account_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_months" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "installment_current" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_linked_account_id" ON "accounts" USING btree ("linked_account_id");