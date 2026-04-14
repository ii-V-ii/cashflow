ALTER TABLE "assets" DROP CONSTRAINT "uq_assets_account_id";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_account_id_accounts_id_fk";
--> statement-breakpoint
DROP INDEX "idx_assets_account_id";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "asset_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_asset_id" ON "accounts" USING btree ("asset_id");--> statement-breakpoint
UPDATE accounts SET asset_id = a.id FROM assets a WHERE a.account_id = accounts.id;--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "account_id";