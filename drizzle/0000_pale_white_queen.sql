CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"outlet_id" integer,
	"work_date" date NOT NULL,
	"clock_in" timestamp with time zone,
	"clock_out" timestamp with time zone,
	"status" text DEFAULT 'present' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"outlet_id" integer,
	"action" text NOT NULL,
	"entity" text DEFAULT '' NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "combo_items" (
	"combo_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "combo_items_combo_id_item_id_pk" PRIMARY KEY("combo_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"min_order" integer DEFAULT 0 NOT NULL,
	"max_discount" integer,
	"valid_from" date,
	"valid_to" date,
	"usage_limit" integer,
	"used" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"birthday" date,
	"address" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"marketing_opt_in" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"name" text NOT NULL,
	"section" text DEFAULT 'Main' NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"expense_date" date NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"order_id" integer,
	"customer_id" integer,
	"rating" integer NOT NULL,
	"food_rating" integer,
	"service_rating" integer,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "franchise_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"budget" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"default_cost" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ingredients_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "item_modifier_groups" (
	"item_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "item_modifier_groups_item_id_group_id_pk" PRIMARY KEY("item_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"hsn" text DEFAULT '996331' NOT NULL,
	"is_veg" boolean DEFAULT true NOT NULL,
	"is_bestseller" boolean DEFAULT false NOT NULL,
	"is_combo" boolean DEFAULT false NOT NULL,
	"jain_available" boolean DEFAULT false NOT NULL,
	"spice_levels" boolean DEFAULT false NOT NULL,
	"prep_minutes" integer DEFAULT 8 NOT NULL,
	"station" text DEFAULT 'main' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kots" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"outlet_id" integer NOT NULL,
	"kot_no" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_txns" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"points" integer NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"min_select" integer DEFAULT 0 NOT NULL,
	"max_select" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"name" text NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"kot_id" integer,
	"station" text DEFAULT 'main' NOT NULL,
	"line_total" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"order_no" text NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'pos' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"table_id" integer,
	"covers" integer,
	"customer_id" integer,
	"customer_name" text DEFAULT '' NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"delivery_address" text DEFAULT '' NOT NULL,
	"delivery_partner_id" integer,
	"waiter_id" integer,
	"cashier_id" integer,
	"subtotal" integer DEFAULT 0 NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"discount_kind" text DEFAULT 'none' NOT NULL,
	"discount_value" integer DEFAULT 0 NOT NULL,
	"discount_reason" text DEFAULT '' NOT NULL,
	"coupon_discount" integer DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"loyalty_redeemed" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"round_off" integer DEFAULT 0 NOT NULL,
	"tip" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"cancel_reason" text DEFAULT '' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"bill_printed" boolean DEFAULT false NOT NULL,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outlet_items" (
	"outlet_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"price" integer,
	"available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "outlet_items_outlet_id_item_id_pk" PRIMARY KEY("outlet_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"fssai" text DEFAULT '' NOT NULL,
	"upi_id" text DEFAULT '' NOT NULL,
	"is_franchise" boolean DEFAULT false NOT NULL,
	"franchisee_name" text DEFAULT '' NOT NULL,
	"royalty_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"open_time" text DEFAULT '08:00' NOT NULL,
	"close_time" text DEFAULT '20:00' NOT NULL,
	"delivery_radius_km" integer DEFAULT 5 NOT NULL,
	"delivery_fee_near" integer DEFAULT 5000 NOT NULL,
	"delivery_fee_far" integer DEFAULT 8000 NOT NULL,
	"bill_footer" text DEFAULT 'Thank you! Visit again.' NOT NULL,
	"tax_inclusive" boolean DEFAULT true NOT NULL,
	"loyalty_enabled" boolean DEFAULT true NOT NULL,
	"loyalty_earn_pct" integer DEFAULT 5 NOT NULL,
	"gst_on" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outlets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"outlet_id" integer NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"supplier_id" integer,
	"invoice_no" text DEFAULT '' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"purchase_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"item_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	CONSTRAINT "recipes_item_id_ingredient_id_pk" PRIMARY KEY("item_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "register_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"opened_by" integer NOT NULL,
	"closed_by" integer,
	"opening_cash" integer DEFAULT 0 NOT NULL,
	"closing_cash" integer,
	"expected_cash" integer,
	"notes" text DEFAULT '' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"outlet_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"min_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"avg_cost" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stock_outlet_id_ingredient_id_pk" PRIMARY KEY("outlet_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"outlet_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"kind" text NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost" integer DEFAULT 0 NOT NULL,
	"ref_id" integer,
	"note" text DEFAULT '' NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"outlet_id" integer,
	"password_hash" text,
	"pin_hash" text,
	"monthly_salary" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_items_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_modifier_groups" ADD CONSTRAINT "item_modifier_groups_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_modifier_groups" ADD CONSTRAINT "item_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kots" ADD CONSTRAINT "kots_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kots" ADD CONSTRAINT "kots_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_txns" ADD CONSTRAINT "loyalty_txns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_txns" ADD CONSTRAINT "loyalty_txns_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_partner_id_users_id_fk" FOREIGN KEY ("delivery_partner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_users_id_fk" FOREIGN KEY ("waiter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_items" ADD CONSTRAINT "outlet_items_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_items" ADD CONSTRAINT "outlet_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_opened_by_users_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register_shifts" ADD CONSTRAINT "register_shifts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock" ADD CONSTRAINT "stock_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_user_date" ON "attendance" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "tables_outlet_name" ON "dining_tables" USING btree ("outlet_id","name");--> statement-breakpoint
CREATE INDEX "items_category_idx" ON "items" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_outlet_date_idx" ON "orders" USING btree ("outlet_id","business_date");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_no_idx" ON "orders" USING btree ("outlet_id","business_date","order_no");--> statement-breakpoint
CREATE INDEX "payments_outlet_date_idx" ON "payments" USING btree ("outlet_id","business_date");--> statement-breakpoint
CREATE INDEX "stock_mov_outlet_idx" ON "stock_movements" USING btree ("outlet_id","created_at");