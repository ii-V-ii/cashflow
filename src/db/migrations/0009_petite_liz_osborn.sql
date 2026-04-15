CREATE TABLE "investment_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"trade_type" text NOT NULL,
	"date" date NOT NULL,
	"ticker" text,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_price" integer NOT NULL,
	"total_amount" integer NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"net_amount" integer NOT NULL,
	"memo" text,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_trades" ADD CONSTRAINT "investment_trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_investment_trades_asset_id" ON "investment_trades" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_investment_trades_date" ON "investment_trades" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_investment_trades_account_id" ON "investment_trades" USING btree ("account_id");