ALTER TABLE "accounts" ADD COLUMN "deposit_type" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "term_months" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "interest_rate" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "tax_type" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "open_date" date;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "monthly_payment" integer;