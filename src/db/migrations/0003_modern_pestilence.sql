ALTER TABLE "categories" ADD COLUMN "expense_kind" text;
--> statement-breakpoint
UPDATE "categories" SET "expense_kind" = 'consumption' WHERE "type" = 'expense';