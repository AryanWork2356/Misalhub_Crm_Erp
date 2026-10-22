import bcrypt from "bcryptjs";
import { getDb, schema } from "./index";
import { sql } from "drizzle-orm";

const rs = (n: number) => Math.round(n * 100);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

type Seed = { name: string; price: number; desc?: string; best?: boolean; spice?: boolean; jain?: boolean; tax?: number; prep?: number; station?: string };

// Menu mirrors https://www.misalhub.com/menu
const MENU: { category: string; items: Seed[] }[] = [
  { category: "Misal Pav", items: [
    { name: "Misal Pav", price: 90, desc: "Classic misal with farsan, onion and pav", best: true, spice: true, jain: true },
    { name: "Only Misal", price: 85, desc: "Misal without pav", spice: true, jain: true },
    { name: "Dahi Misal Pav", price: 110, desc: "Topped with fresh yogurt", spice: true },
    { name: "Vada Misal Pav", price: 110, desc: "Batata vada soaked in misal", best: true, spice: true, jain: true },
    { name: "Only Vada Misal", price: 105, desc: "Vada misal without pav", spice: true },
    { name: "Cheese Misal Pav", price: 130, desc: "With melted cheese", spice: true },
    { name: "Fry Misal Pav", price: 120, desc: "Tawa-fried, extra crispy", best: true, spice: true, jain: true },
    { name: "Only Fry Misal", price: 110, desc: "Fry misal without pav", spice: true },
    { name: "Cheese Fry Misal Pav", price: 160, desc: "Fry misal with melted cheese", spice: true },
    { name: "Nikahara Misal Pav", price: 125, desc: "Drier, intense style served in a clay pot", best: true, spice: true, jain: true },
    { name: "Sizzling Fry Misal Pav", price: 240, desc: "Served sizzling on a tawa plate", spice: true },
  ] },
  { category: "Usal Pav", items: [
    { name: "Usal Pav", price: 85, desc: "Matki usal with buttered pav", spice: true, jain: true },
    { name: "Only Usal", price: 80, desc: "Usal without pav", spice: true },
    { name: "Vada Usal Pav", price: 100, desc: "Usal with batata vada and pav", spice: true },
  ] },
  { category: "Chulha Misal", items: [
    { name: "Chulha Misal (Group of 4)", price: 850, desc: "4 misal, 15 pav, 4 batata vada, 1 plate mix bhajiya, 4 gulab jamun, 2 dahi, 2 chaas, 2 kokum sarbat", prep: 20 },
  ] },
  { category: "Thali", items: [
    { name: "Misal Thali", price: 170, desc: "Rassa, misal, farsan, aloo sabji, tarri, dahi, papad, salad, 4 pav, chaas, sweet", best: true, spice: true, jain: true, prep: 10 },
    { name: "Nikhara Misal Thali", price: 200, desc: "Misal Thali in nikahara style", best: true, spice: true, prep: 10 },
    { name: "Fry Misal Thali", price: 220, desc: "Rassa, misal, farsan, tarri, papad, salad, 4 butter pav, chaas, sweet", spice: true, prep: 10 },
  ] },
  { category: "Combos", items: [
    { name: "Misal Pav Combo", price: 135, desc: "Misal pav, chaas, 1 L mineral water" },
    { name: "Misal Pav & Fry Misal Pav Combo", price: 255, desc: "Misal pav, fry misal pav, 1 chaas, 1 L mineral water" },
    { name: "Vada Usal Pav Combo", price: 365, desc: "Vada usal pav, misal pav, chole puri, 4 puri, 4 pav, 1 L mineral water", prep: 12 },
    { name: "Nikahara Misal Pav Combo", price: 290, desc: "Nikahara misal pav, fry misal pav, 4 pav, 1 chaas" },
  ] },
  { category: "Snacks", items: [
    { name: "Masala Papad", price: 70 }, { name: "Samosa Pav", price: 25 }, { name: "Samosa (2 pc)", price: 40 },
    { name: "Kanda Bhajiya", price: 100 }, { name: "Batata Bhajiya", price: 100 }, { name: "Mix Bhajiya", price: 140 },
    { name: "Moongdal Bhajiya", price: 120 }, { name: "Bread Cutlet", price: 30 }, { name: "Sabudana Vada", price: 70 },
    { name: "Sabudana Khichdi", price: 80 }, { name: "Kande Pohe", price: 70 }, { name: "Upma", price: 70 },
    { name: "Aloo Paratha with Curd (2 pc)", price: 150 }, { name: "Moong Dal Bhaji", price: 90 },
    { name: "Paneer Bhurji (2 Pav)", price: 170 },
  ] },
  { category: "Vada Pav", items: [
    { name: "Vada Pav", price: 25, best: true }, { name: "Cheese Grill Vada Pav", price: 65 },
    { name: "Mayonnaise Vada Pav", price: 35 }, { name: "Tandoori Vada Pav", price: 40 },
    { name: "Loaded Cheese Grill Vada Pav", price: 75 }, { name: "Batata Vada (2 pc)", price: 40 },
  ] },
  { category: "Chole Puri / Puri Bhaji", items: [
    { name: "Chole Puri", price: 110 }, { name: "Puri (5 pcs)", price: 45 }, { name: "Puri Bhaji", price: 90 },
  ] },
  { category: "Sandwich", items: [
    { name: "Sada Sandwich", price: 80 }, { name: "Veg Grill Sandwich", price: 120 },
    { name: "Veg Cheese Grill Sandwich", price: 160 }, { name: "Masala Grill Sandwich", price: 145 },
    { name: "Masala Cheese Grill Sandwich", price: 180 }, { name: "Loaded Sandwich", price: 199 },
    { name: "Cheese Chilly Grill Sandwich", price: 170 }, { name: "Tandoori Mayo Cheese Grill Sandwich", price: 190 },
  ] },
  { category: "Beverages", items: [
    { name: "Kulhad Tea", price: 25, best: true, station: "bar", prep: 4 },
    { name: "Kulhad Nescafe Coffee", price: 45, station: "bar", prep: 4 },
    { name: "Chaas", price: 30, station: "bar", prep: 2 },
    { name: "Mineral Water 1 Ltr", price: 20, station: "bar", prep: 1, tax: 18 },
    { name: "Cold Drink", price: 20, station: "bar", prep: 1, tax: 18 },
    { name: "Kokam Soda", price: 80, station: "bar", prep: 3 },
    { name: "Kokam Sarbat", price: 60, best: true, station: "bar", prep: 3 },
    { name: "Solkadhi", price: 60, station: "bar", prep: 3 },
  ] },
  { category: "Extras", items: [
    { name: "Pav", price: 5, prep: 1 }, { name: "Butter Pav", price: 20, prep: 2 }, { name: "Farsan", price: 15, prep: 1 },
    { name: "Papad", price: 10, prep: 1 }, { name: "Cheese", price: 35, prep: 1 }, { name: "Dahi", price: 25, prep: 1 },
    { name: "Gulab Jamun", price: 20, prep: 1 }, { name: "Rassa Vati", price: 25, prep: 2 },
  ] },
];

const INGREDIENTS: [string, "kg" | "g" | "l" | "ml" | "pcs", string, number, number][] = [
  // name, unit, category, cost rupees per unit, min qty (outlet)
  ["Matki (moth beans)", "kg", "Pulses", 130, 10], ["Green peas (matar)", "kg", "Pulses", 110, 5], ["Chana (kala chana)", "kg", "Pulses", 120, 5],
  ["Onion", "kg", "Vegetables", 35, 15], ["Tomato", "kg", "Vegetables", 40, 8], ["Potato", "kg", "Vegetables", 30, 20],
  ["Coriander", "kg", "Vegetables", 80, 2], ["Green chilli", "kg", "Vegetables", 90, 1],
  ["Farsan", "kg", "Dry goods", 180, 10], ["Besan", "kg", "Dry goods", 90, 8], ["Sabudana", "kg", "Dry goods", 85, 3], ["Poha", "kg", "Dry goods", 70, 4], ["Rava", "kg", "Dry goods", 55, 3],
  ["Misal masala (fresh ground)", "kg", "Masala", 450, 3], ["Kokam", "kg", "Masala", 400, 1],
  ["Pav", "pcs", "Bakery", 4, 200], ["Bread slice", "pcs", "Bakery", 3, 100], ["Puri", "pcs", "Bakery", 3, 60], ["Papad", "pcs", "Dry goods", 2, 100],
  ["Refined oil", "l", "Oil & fat", 140, 15], ["Butter", "kg", "Dairy", 520, 3], ["Cheese", "kg", "Dairy", 480, 3], ["Curd (dahi)", "kg", "Dairy", 70, 6],
  ["Milk", "l", "Dairy", 58, 10], ["Buttermilk base", "l", "Dairy", 30, 5], ["Paneer", "kg", "Dairy", 340, 2],
  ["Tea leaves", "kg", "Beverage", 450, 1], ["Sugar", "kg", "Beverage", 45, 8], ["Nescafe", "kg", "Beverage", 1600, 0.5],
  ["Kulhad", "pcs", "Packaging", 3, 200], ["Water bottle 1L", "pcs", "Beverage", 8, 40], ["Cold drink bottle", "pcs", "Beverage", 14, 30],
  ["Packaging box", "pcs", "Packaging", 6, 100], ["Gulab jamun", "pcs", "Sweets", 7, 40], ["LPG cylinder", "pcs", "Fuel", 1900, 2],
];

// recipe: item name -> [ingredient, qty per portion]
const RECIPES: Record<string, [string, number][]> = {
  "Misal Pav": [["Matki (moth beans)", 0.06], ["Onion", 0.04], ["Farsan", 0.03], ["Misal masala (fresh ground)", 0.01], ["Pav", 2], ["Refined oil", 0.02], ["Coriander", 0.005]],
  "Only Misal": [["Matki (moth beans)", 0.06], ["Onion", 0.04], ["Farsan", 0.03], ["Misal masala (fresh ground)", 0.01], ["Refined oil", 0.02]],
  "Vada Misal Pav": [["Matki (moth beans)", 0.05], ["Potato", 0.1], ["Besan", 0.03], ["Onion", 0.04], ["Farsan", 0.03], ["Misal masala (fresh ground)", 0.01], ["Pav", 2], ["Refined oil", 0.04]],
  "Fry Misal Pav": [["Matki (moth beans)", 0.06], ["Onion", 0.05], ["Farsan", 0.03], ["Misal masala (fresh ground)", 0.012], ["Pav", 2], ["Butter", 0.015], ["Refined oil", 0.03]],
  "Nikahara Misal Pav": [["Matki (moth beans)", 0.07], ["Onion", 0.05], ["Misal masala (fresh ground)", 0.015], ["Pav", 2], ["Refined oil", 0.03], ["Kulhad", 1]],
  "Cheese Misal Pav": [["Matki (moth beans)", 0.06], ["Onion", 0.04], ["Farsan", 0.03], ["Cheese", 0.03], ["Misal masala (fresh ground)", 0.01], ["Pav", 2]],
  "Usal Pav": [["Matki (moth beans)", 0.07], ["Onion", 0.04], ["Pav", 2], ["Butter", 0.01], ["Refined oil", 0.02]],
  "Vada Pav": [["Potato", 0.1], ["Besan", 0.03], ["Pav", 1], ["Refined oil", 0.04]],
  "Samosa Pav": [["Potato", 0.08], ["Pav", 1], ["Refined oil", 0.03]],
  "Kande Pohe": [["Poha", 0.08], ["Onion", 0.05], ["Refined oil", 0.015]],
  "Upma": [["Rava", 0.08], ["Onion", 0.03], ["Refined oil", 0.015]],
  "Sabudana Khichdi": [["Sabudana", 0.08], ["Potato", 0.05], ["Refined oil", 0.02]],
  "Kulhad Tea": [["Tea leaves", 0.004], ["Milk", 0.1], ["Sugar", 0.01], ["Kulhad", 1]],
  "Chaas": [["Curd (dahi)", 0.1], ["Buttermilk base", 0.1]],
  "Pav": [["Pav", 1]], "Butter Pav": [["Pav", 2], ["Butter", 0.01]], "Papad": [["Papad", 1]], "Farsan": [["Farsan", 0.03]],
  "Cheese": [["Cheese", 0.02]], "Dahi": [["Curd (dahi)", 0.06]], "Gulab Jamun": [["Gulab jamun", 1]],
  "Mineral Water 1 Ltr": [["Water bottle 1L", 1]], "Cold Drink": [["Cold drink bottle", 1]],
  "Kokam Sarbat": [["Kokam", 0.01], ["Sugar", 0.03]],
};

async function main() {
  const prod = !!process.env.DATABASE_URL;
  if (prod && !process.argv.includes("--i-understand-this-wipes-the-database")) {
    console.error("This seed script WIPES every table. Refusing to run against DATABASE_URL.\nIf this is a brand-new empty database, re-run with --i-understand-this-wipes-the-database and SEED_OWNER_PASSWORD set.");
    process.exit(1);
  }
  if (prod && (process.env.SEED_OWNER_PASSWORD ?? "").length < 10) {
    console.error("Set SEED_OWNER_PASSWORD (10+ characters) so the owner account isn't created with a known default.");
    process.exit(1);
  }
  // Optional for demo/staging deployments: also create one account per role, with credentials YOU choose
  // (every staff account gets password = SEED_OWNER_PASSWORD and PIN = SEED_STAFF_PIN). Never the public defaults.
  const demoStaff = prod && process.env.SEED_DEMO_STAFF === "1";
  if (demoStaff && !/^\d{4,6}$/.test(process.env.SEED_STAFF_PIN ?? "")) {
    console.error("SEED_DEMO_STAFF=1 needs SEED_STAFF_PIN (4-6 digits, not 1234/4444) for the demo staff accounts.");
    process.exit(1);
  }
  const db = await getDb();
  const demoPass = process.env.SEED_OWNER_PASSWORD || "Misal@2026";

  // Wipe in dependency order so seed can be re-run on a dev database.
  await db.execute(sql`TRUNCATE TABLE ${sql.raw(
    ["audit_logs", "franchise_leads", "feedback", "attendance", "expenses", "stock_movements", "purchase_items", "purchases", "suppliers", "recipes", "stock", "ingredients",
      "register_shifts", "loyalty_txns", "coupons", "payments", "kots", "order_items", "orders", "customers", "dining_tables", "outlet_items", "item_modifier_groups",
      "modifiers", "modifier_groups", "combo_items", "items", "categories", "users", "outlets"].join(", "),
  )} RESTART IDENTITY CASCADE`);

  const [hq] = await db.insert(schema.outlets).values({
    code: "MRD", name: "Misal Hub – Mira Road", address: "Shop 2/3, Silver Cassia Apartment, Pleasant Park Road, near Gayatri Dham, Mira Road East, Mira Bhayandar, Maharashtra 401107",
    phone: "9004167448", upiId: process.env.NEXT_PUBLIC_UPI_ID || "", billFooter: "Authentic Flavours, Straight from the Heart. Thank you, visit again!",
    openTime: "08:00", closeTime: "20:00", deliveryRadiusKm: 5, deliveryFeeNear: rs(50), deliveryFeeFar: rs(80),
  }).returning();
  const [fr] = await db.insert(schema.outlets).values({
    code: "FR01", name: "Misal Hub – Franchise Sample", address: "Sample franchise outlet (edit or delete in Settings → Outlets)", phone: "",
    isFranchise: true, franchiseeName: "Sample Franchisee", royaltyPct: "5", openTime: "08:00", closeTime: "20:00", billFooter: "Thank you, visit again!",
  }).returning();

  const hash = (p: string) => bcrypt.hashSync(p, 10);
  const staff: { name: string; phone: string; role: schema.UserRole; outletId: number | null; pin?: string; password?: string; salary?: number }[] = [
    { name: "Owner", phone: "9004167448", role: "owner", outletId: null, password: demoPass, pin: "1111" },
    { name: "Head Office Admin", phone: "9000000001", role: "admin", outletId: null, password: demoPass, pin: "2222" },
    { name: "Store Manager", phone: "9000000002", role: "manager", outletId: hq.id, password: demoPass, pin: "3333", salary: 25000 },
    { name: "Cashier", phone: "9000000003", role: "cashier", outletId: hq.id, pin: "4444", salary: 15000 },
    { name: "Waiter", phone: "9000000004", role: "waiter", outletId: hq.id, pin: "5555", salary: 12000 },
    { name: "Kitchen", phone: "9000000005", role: "kitchen", outletId: hq.id, pin: "6666", salary: 18000 },
    { name: "Delivery Boy", phone: "9000000006", role: "delivery", outletId: hq.id, pin: "7777", salary: 12000 },
    { name: "Franchisee", phone: "9000000007", role: "franchisee", outletId: fr.id, password: demoPass, pin: "8888" },
  ];
  // In production only the owner is created; add everyone else from Staff in the app.
  const seedStaff = (prod ? (demoStaff ? staff : staff.filter((s) => s.role === "owner")) : staff)
    .map((s) => (demoStaff ? { ...s, pin: process.env.SEED_STAFF_PIN, password: s.password ? demoPass : undefined } : s));
  await db.insert(schema.users).values(seedStaff.map((s) => ({
    name: s.name, phone: s.phone, role: s.role, outletId: s.outletId, monthlySalary: rs(s.salary ?? 0),
    passwordHash: s.password ? hash(s.password) : null, pinHash: s.pin ? hash(s.pin) : null,
  })));

  // Categories + items
  const catRows = await db.insert(schema.categories).values(MENU.map((c, i) => ({ name: c.category, slug: slug(c.category), sortOrder: i }))).returning();
  const catId = new Map(catRows.map((c) => [c.name, c.id]));
  let n = 0;
  const itemRows = await db.insert(schema.items).values(MENU.flatMap((c) => c.items.map((it, idx) => ({
    categoryId: catId.get(c.category)!, code: `MH${String(++n).padStart(3, "0")}`, name: it.name, description: it.desc ?? "", price: rs(it.price),
    taxPct: String(it.tax ?? 5), isVeg: true, isBestseller: !!it.best, isCombo: c.category === "Combos" || c.category === "Chulha Misal",
    jainAvailable: !!it.jain, spiceLevels: !!it.spice, prepMinutes: it.prep ?? 8, station: it.station ?? "main", sortOrder: idx,
  })))).returning();
  const itemId = new Map(itemRows.map((i) => [i.name, i.id]));

  // Modifier groups
  const [spice, prep, addons] = await db.insert(schema.modifierGroups).values([
    { name: "Spice level", minSelect: 1, maxSelect: 1 }, { name: "Preparation", minSelect: 1, maxSelect: 1 }, { name: "Add-ons", minSelect: 0, maxSelect: 8 },
  ]).returning();
  await db.insert(schema.modifiers).values([
    { groupId: spice.id, name: "Mild", price: 0 }, { groupId: spice.id, name: "Medium", price: 0, isDefault: true },
    { groupId: spice.id, name: "Spicy", price: 0 }, { groupId: spice.id, name: "Extra spicy (jhanjhanit)", price: 0 },
    { groupId: prep.id, name: "Regular", price: 0, isDefault: true }, { groupId: prep.id, name: "Jain (no onion/garlic)", price: 0 },
    ...["Pav:5", "Butter Pav:20", "Farsan:15", "Papad:10", "Cheese:35", "Dahi:25", "Gulab Jamun:20", "Rassa Vati:25"].map((s) => {
      const [name, p] = s.split(":"); return { groupId: addons.id, name: `Extra ${name}`, price: rs(Number(p)) };
    }),
  ]);
  const links: { itemId: number; groupId: number }[] = [];
  for (const it of itemRows) {
    if (it.spiceLevels) links.push({ itemId: it.id, groupId: spice.id });
    if (it.jainAvailable) links.push({ itemId: it.id, groupId: prep.id });
    const cat = catRows.find((c) => c.id === it.categoryId)!.name;
    if (["Misal Pav", "Usal Pav", "Thali", "Vada Pav", "Snacks"].includes(cat)) links.push({ itemId: it.id, groupId: addons.id });
  }
  await db.insert(schema.itemModifierGroups).values(links);

  // Tables for the main outlet (+ a few for the sample franchise)
  await db.insert(schema.diningTables).values([
    ...Array.from({ length: 6 }, (_, i) => ({ outletId: hq.id, name: `T${i + 1}`, section: "Dining", capacity: i < 4 ? 4 : 6 })),
    ...Array.from({ length: 2 }, (_, i) => ({ outletId: hq.id, name: `C${i + 1}`, section: "Counter", capacity: 2 })),
    ...Array.from({ length: 4 }, (_, i) => ({ outletId: fr.id, name: `T${i + 1}`, section: "Dining", capacity: 4 })),
  ]);

  // Inventory
  const ingRows = await db.insert(schema.ingredients).values(INGREDIENTS.map(([name, unit, category, cost]) => ({ name, unit, category, defaultCost: rs(cost) }))).returning();
  const ingId = new Map(ingRows.map((i) => [i.name, i.id]));
  for (const outlet of [hq, fr]) {
    await db.insert(schema.stock).values(INGREDIENTS.map(([name, , , cost, min]) => ({
      outletId: outlet.id, ingredientId: ingId.get(name)!, qty: String(min * 3), minQty: String(min), avgCost: rs(cost),
    })));
  }
  const recipeRows = Object.entries(RECIPES).flatMap(([item, lines]) =>
    lines.map(([ing, qty]) => ({ itemId: itemId.get(item)!, ingredientId: ingId.get(ing)!, qty: String(qty) })));
  await db.insert(schema.recipes).values(recipeRows);
  await db.insert(schema.suppliers).values([
    { name: "Local Pulses & Grains", phone: "" }, { name: "Bakery (Pav)", phone: "" }, { name: "Dairy Supplier", phone: "" }, { name: "Vegetable Mandi", phone: "" },
  ]);

  await db.insert(schema.coupons).values([
    { code: "WELCOME10", description: "10% off for new customers (max ₹50)", kind: "percent", value: 10, minOrder: rs(150), maxDiscount: rs(50) },
    { code: "MISAL20", description: "Flat ₹20 off on orders above ₹200", kind: "flat", value: rs(20), minOrder: rs(200) },
  ]);

  console.log("\nSeed complete.");
  console.log(`Items: ${itemRows.length}, ingredients: ${ingRows.length}, recipes: ${recipeRows.length}`);
  console.log("\nLogins (phone / password or PIN):");
  for (const s of seedStaff) console.log(`  ${s.role.padEnd(10)} ${s.phone}  ${s.password ? "password: " + s.password + "  " : ""}${s.pin ? "PIN: " + s.pin : ""}`);
  console.log(prod ? "\nSign in as the owner and add your staff from Staff → Add staff.\n" : "\nThese are demo credentials — never use them in production.\n");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
