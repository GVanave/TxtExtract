CREATE TABLE "categories" (
	"id" smallint PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category_memory" (
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"category_id" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_memory_user_id_store_id_product_key_pk" PRIMARY KEY("user_id","store_id","product_key")
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"raw_text" text NOT NULL,
	"name" text NOT NULL,
	"line_type" text NOT NULL,
	"quantity" numeric(10, 3),
	"unit" text,
	"unit_price_cents" integer,
	"total_cents" integer NOT NULL,
	"vat_code" text,
	"category_id" smallint,
	"category_source" text,
	CONSTRAINT "receipt_items_line_type" CHECK ("receipt_items"."line_type" IN ('product','deposit','deposit_return','discount','other')),
	CONSTRAINT "receipt_items_category_source" CHECK ("receipt_items"."category_source" IN ('model','memory','user'))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"store_raw" text NOT NULL,
	"store_address" text,
	"purchased_on" date NOT NULL,
	"purchased_at" time,
	"total_cents" integer NOT NULL,
	"currency" char(3) DEFAULT 'EUR' NOT NULL,
	"payment_method" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"issues" text[] DEFAULT '{}'::text[] NOT NULL,
	"model" text,
	"image_name" text,
	"raw_extraction" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_aliases" (
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"store_id" uuid NOT NULL,
	CONSTRAINT "store_aliases_user_id_alias_pk" PRIMARY KEY("user_id","alias")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "category_memory" ADD CONSTRAINT "category_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_memory" ADD CONSTRAINT "category_memory_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_memory" ADD CONSTRAINT "category_memory_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_aliases" ADD CONSTRAINT "store_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_aliases" ADD CONSTRAINT "store_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_memory_key" ON "category_memory" USING btree ("user_id","product_key");--> statement-breakpoint
CREATE INDEX "receipt_items_receipt" ON "receipt_items" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "receipts_user_date" ON "receipts" USING btree ("user_id","purchased_on" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "stores_user_name" ON "stores" USING btree ("user_id",lower("name"));