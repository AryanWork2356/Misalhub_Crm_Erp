import {
  pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb, date, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";

// All money columns are integers in paise (₹1 = 100). Quantities of stock use numeric.

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const outlets = pgTable("outlets", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  fssai: text("fssai").notNull().default(""),
  upiId: text("upi_id").notNull().default(""),
  isFranchise: boolean("is_franchise").notNull().default(false),
  franchiseeName: text("franchisee_name").notNull().default(""),
  royaltyPct: numeric("royalty_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  openTime: text("open_time").notNull().default("08:00"),
  closeTime: text("close_time").notNull().default("20:00"),
  deliveryRadiusKm: integer("delivery_radius_km").notNull().default(5),
  deliveryFeeNear: integer("delivery_fee_near").notNull().default(5000),
  deliveryFeeFar: integer("delivery_fee_far").notNull().default(8000),
  billFooter: text("bill_footer").notNull().default("Thank you! Visit again."),
  taxInclusive: boolean("tax_inclusive").notNull().default(true),
  loyaltyEnabled: boolean("loyalty_enabled").notNull().default(true),
  loyaltyEarnPct: integer("loyalty_earn_pct").notNull().default(5),
  gstOn: boolean("gst_on").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const USER_ROLES = ["owner", "admin", "franchisee", "manager", "cashier", "waiter", "kitchen", "delivery"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  role: text("role", { enum: USER_ROLES }).notNull(),
  outletId: integer("outlet_id").references(() => outlets.id),
  passwordHash: text("password_hash"),
  pinHash: text("pin_hash"),
  monthlySalary: integer("monthly_salary").notNull().default(0),
  active: boolean("active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  taxPct: numeric("tax_pct", { precision: 5, scale: 2 }).notNull().default("5"),
  hsn: text("hsn").notNull().default("996331"),
  isVeg: boolean("is_veg").notNull().default(true),
  isBestseller: boolean("is_bestseller").notNull().default(false),
  isCombo: boolean("is_combo").notNull().default(false),
  jainAvailable: boolean("jain_available").notNull().default(false),
  spiceLevels: boolean("spice_levels").notNull().default(false),
  prepMinutes: integer("prep_minutes").notNull().default(8),
  station: text("station").notNull().default("main"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [index("items_category_idx").on(t.categoryId)]);

export const comboItems = pgTable("combo_items", {
  comboId: integer("combo_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  qty: integer("qty").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.comboId, t.itemId] })]);

export const modifierGroups = pgTable("modifier_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
});

export const modifiers = pgTable("modifiers", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: integer("price").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
});

export const itemModifierGroups = pgTable("item_modifier_groups", {
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => modifierGroups.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.itemId, t.groupId] })]);

// Per-outlet price override + stock-out toggle
export const outletItems = pgTable("outlet_items", {
  outletId: integer("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  price: integer("price"),
  available: boolean("available").notNull().default(true),
}, (t) => [primaryKey({ columns: [t.outletId, t.itemId] })]);

export const diningTables = pgTable("dining_tables", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  section: text("section").notNull().default("Main"),
  capacity: integer("capacity").notNull().default(4),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("tables_outlet_name").on(t.outletId, t.name)]);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().unique(),
  email: text("email"),
  birthday: date("birthday"),
  address: text("address").notNull().default(""),
  notes: text("notes").notNull().default(""),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  totalSpent: integer("total_spent").notNull().default(0),
  visits: integer("visits").notNull().default(0),
  lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(true),
  createdAt: createdAt(),
});

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery", "bulk"] as const;
export const ORDER_CHANNELS = ["pos", "website", "whatsapp", "qr", "swiggy", "zomato", "phone"] as const;
export const ORDER_STATUSES = ["new", "preparing", "ready", "served", "out_for_delivery", "completed", "cancelled"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  orderNo: text("order_no").notNull(),
  type: text("type", { enum: ORDER_TYPES }).notNull(),
  channel: text("channel", { enum: ORDER_CHANNELS }).notNull().default("pos"),
  status: text("status", { enum: ORDER_STATUSES }).notNull().default("new"),
  tableId: integer("table_id").references(() => diningTables.id),
  covers: integer("covers"),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name").notNull().default(""),
  customerPhone: text("customer_phone").notNull().default(""),
  deliveryAddress: text("delivery_address").notNull().default(""),
  deliveryPartnerId: integer("delivery_partner_id").references(() => users.id),
  waiterId: integer("waiter_id").references(() => users.id),
  cashierId: integer("cashier_id").references(() => users.id),
  subtotal: integer("subtotal").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  discountKind: text("discount_kind", { enum: ["none", "percent", "flat"] }).notNull().default("none"),
  discountValue: integer("discount_value").notNull().default(0),
  discountReason: text("discount_reason").notNull().default(""),
  couponDiscount: integer("coupon_discount").notNull().default(0),
  couponCode: text("coupon_code"),
  loyaltyRedeemed: integer("loyalty_redeemed").notNull().default(0),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  tax: integer("tax").notNull().default(0),
  roundOff: integer("round_off").notNull().default(0),
  tip: integer("tip").notNull().default(0),
  total: integer("total").notNull().default(0),
  paid: integer("paid").notNull().default(0),
  paymentStatus: text("payment_status", { enum: ["unpaid", "partial", "paid", "refunded"] }).notNull().default("unpaid"),
  notes: text("notes").notNull().default(""),
  cancelReason: text("cancel_reason").notNull().default(""),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  billPrinted: boolean("bill_printed").notNull().default(false),
  businessDate: date("business_date").notNull(),
  createdAt: createdAt(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => [
  index("orders_outlet_date_idx").on(t.outletId, t.businessDate),
  index("orders_status_idx").on(t.status),
  uniqueIndex("orders_no_idx").on(t.outletId, t.businessDate, t.orderNo),
]);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  name: text("name").notNull(),
  variant: text("variant").notNull().default(""),
  qty: integer("qty").notNull(),
  unitPrice: integer("unit_price").notNull(),
  taxPct: numeric("tax_pct", { precision: 5, scale: 2 }).notNull().default("5"),
  modifiers: jsonb("modifiers").$type<{ id: number; name: string; price: number }[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["pending", "preparing", "ready", "served", "cancelled"] }).notNull().default("pending"),
  kotId: integer("kot_id"),
  station: text("station").notNull().default("main"),
  lineTotal: integer("line_total").notNull(),
  createdAt: createdAt(),
}, (t) => [index("order_items_order_idx").on(t.orderId)]);

export const kots = pgTable("kots", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  kotNo: integer("kot_no").notNull(),
  createdAt: createdAt(),
});

export const PAYMENT_METHODS = ["cash", "upi", "card", "wallet", "online", "due"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  method: text("method", { enum: PAYMENT_METHODS }).notNull(),
  amount: integer("amount").notNull(),
  reference: text("reference").notNull().default(""),
  userId: integer("user_id").references(() => users.id),
  businessDate: date("business_date").notNull(),
  createdAt: createdAt(),
}, (t) => [index("payments_outlet_date_idx").on(t.outletId, t.businessDate)]);

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  description: text("description").notNull().default(""),
  kind: text("kind", { enum: ["percent", "flat"] }).notNull(),
  value: integer("value").notNull(),
  minOrder: integer("min_order").notNull().default(0),
  maxDiscount: integer("max_discount"),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  usageLimit: integer("usage_limit"),
  used: integer("used").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const loyaltyTxns = pgTable("loyalty_txns", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id),
  points: integer("points").notNull(),
  kind: text("kind", { enum: ["earn", "redeem", "adjust", "bonus"] }).notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

export const registerShifts = pgTable("register_shifts", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  openedBy: integer("opened_by").notNull().references(() => users.id),
  closedBy: integer("closed_by").references(() => users.id),
  openingCash: integer("opening_cash").notNull().default(0),
  closingCash: integer("closing_cash"),
  expectedCash: integer("expected_cash"),
  notes: text("notes").notNull().default(""),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

// ---------- Inventory ----------
export const ingredients = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  unit: text("unit", { enum: ["kg", "g", "l", "ml", "pcs"] }).notNull(),
  category: text("category").notNull().default("General"),
  defaultCost: integer("default_cost").notNull().default(0), // paise per unit
  active: boolean("active").notNull().default(true),
});

export const stock = pgTable("stock", {
  outletId: integer("outlet_id").notNull().references(() => outlets.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("0"),
  minQty: numeric("min_qty", { precision: 14, scale: 3 }).notNull().default("0"),
  avgCost: integer("avg_cost").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.outletId, t.ingredientId] })]);

export const recipes = pgTable("recipes", {
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
  qty: numeric("qty", { precision: 14, scale: 4 }).notNull(),
}, (t) => [primaryKey({ columns: [t.itemId, t.ingredientId] })]);

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  active: boolean("active").notNull().default(true),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  invoiceNo: text("invoice_no").notNull().default(""),
  total: integer("total").notNull().default(0),
  paid: integer("paid").notNull().default(0),
  note: text("note").notNull().default(""),
  userId: integer("user_id").references(() => users.id),
  purchaseDate: date("purchase_date").notNull(),
  createdAt: createdAt(),
});

export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
  unitCost: integer("unit_cost").notNull(),
});

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredients.id),
  kind: text("kind", { enum: ["purchase", "sale", "wastage", "adjustment", "production", "transfer_in", "transfer_out"] }).notNull(),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull(), // signed
  unitCost: integer("unit_cost").notNull().default(0),
  refId: integer("ref_id"),
  note: text("note").notNull().default(""),
  userId: integer("user_id").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("stock_mov_outlet_idx").on(t.outletId, t.createdAt)]);

// ---------- Finance & people ----------
export const EXPENSE_CATEGORIES = ["Raw material", "Rent", "Salary", "Electricity", "Gas / LPG", "Packaging", "Marketing", "Maintenance", "Delivery", "Misc"] as const;

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  category: text("category").notNull(),
  amount: integer("amount").notNull(),
  method: text("method", { enum: ["cash", "upi", "bank", "card"] }).notNull().default("cash"),
  note: text("note").notNull().default(""),
  expenseDate: date("expense_date").notNull(),
  userId: integer("user_id").references(() => users.id),
  createdAt: createdAt(),
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  outletId: integer("outlet_id").references(() => outlets.id),
  workDate: date("work_date").notNull(),
  clockIn: timestamp("clock_in", { withTimezone: true }),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  status: text("status", { enum: ["present", "absent", "half_day", "leave"] }).notNull().default("present"),
}, (t) => [uniqueIndex("attendance_user_date").on(t.userId, t.workDate)]);

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  outletId: integer("outlet_id").notNull().references(() => outlets.id),
  orderId: integer("order_id").references(() => orders.id),
  customerId: integer("customer_id").references(() => customers.id),
  rating: integer("rating").notNull(),
  foodRating: integer("food_rating"),
  serviceRating: integer("service_rating"),
  comment: text("comment").notNull().default(""),
  createdAt: createdAt(),
});

export const franchiseLeads = pgTable("franchise_leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull().default(""),
  budget: text("budget").notNull().default(""),
  message: text("message").notNull().default(""),
  status: text("status", { enum: ["new", "contacted", "meeting", "agreement", "won", "lost"] }).notNull().default("new"),
  notes: text("notes").notNull().default(""),
  createdAt: createdAt(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  outletId: integer("outlet_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull().default(""),
  entityId: text("entity_id").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: createdAt(),
});

export type Outlet = typeof outlets.$inferSelect;
export type User = typeof users.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Customer = typeof customers.$inferSelect;
