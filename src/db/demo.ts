// Generates ~6 weeks of realistic demo activity through the real order engine. Dev only.
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./index";
import { saveOrder, payOrder, markDelivered, assignDelivery } from "../lib/orders";
import { addDays, businessDate } from "../lib/dates";

if (process.env.DATABASE_URL && !process.argv.includes("--i-understand-this-adds-fake-orders")) {
  console.error("Refusing to add FAKE demo orders to a DATABASE_URL database. Re-run with --i-understand-this-adds-fake-orders only for a demo/staging database.");
  process.exit(1);
}

let seed = 42;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const wpick = <T,>(a: [T, number][]) => { const t = a.reduce((s, x) => s + x[1], 0); let r = rnd() * t; for (const [v, w] of a) { if ((r -= w) <= 0) return v; } return a[0][0]; };

const FIRST = ["Aarav", "Vivaan", "Aditya", "Sai", "Rohan", "Karan", "Neha", "Priya", "Sneha", "Pooja", "Anjali", "Rahul", "Amit", "Suresh", "Manoj", "Kavita", "Meera", "Nikhil", "Omkar", "Swapnil", "Tejas", "Sanket", "Prachi", "Rutuja", "Shweta"];
const LAST = ["Patil", "Shah", "Sharma", "Gupta", "Deshmukh", "Joshi", "Kulkarni", "Mehta", "Naik", "Pawar", "Jadhav", "More", "Singh", "Yadav", "Desai"];
const AREAS = ["Pleasant Park", "Gayatri Dham", "Shanti Nagar", "Beverly Park", "Kashimira", "Silver Park", "Poonam Sagar", "Mira Road Station"];

async function main() {
  const db = await getDb();
  const outlets = await db.select().from(schema.outlets).orderBy(schema.outlets.id);
  const users = await db.select().from(schema.users);
  const allItems = await db.select().from(schema.items);
  const cats = await db.select().from(schema.categories);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const mods = await db.select().from(schema.modifiers);
  const links = await db.select().from(schema.itemModifierGroups);
  const spiceMods = mods.filter((m) => ["Mild", "Medium", "Spicy", "Extra spicy (jhanjhanit)"].includes(m.name));
  const jainMod = mods.find((m) => m.name.startsWith("Jain"));
  const regularMod = mods.find((m) => m.name === "Regular");
  const addonMods = mods.filter((m) => m.name.startsWith("Extra "));
  const groupOf = (itemId: number) => new Set(links.filter((l) => l.itemId === itemId).map((l) => l.groupId));
  const spiceGroup = mods.find((m) => m.name === "Mild")!.groupId;
  const prepGroup = jainMod!.groupId;

  // weights: bestsellers and core misal items sell most; extras/combos rarely
  const weighted: [typeof allItems[number], number][] = allItems.filter((i) => catName.get(i.categoryId) !== "Extras").map((i) => {
    const c = catName.get(i.categoryId);
    let w = 1;
    if (c === "Misal Pav") w = 6; else if (c === "Usal Pav") w = 2.5; else if (c === "Vada Pav") w = 4; else if (c === "Beverages") w = 4; else if (c === "Thali") w = 2.5;
    else if (c === "Snacks") w = 2; else if (c === "Combos") w = 1.2; else if (c === "Sandwich") w = 1.2; else if (c === "Chulha Misal") w = 0.1;
    if (i.isBestseller) w *= 1.8;
    return [i, w];
  });

  // customer pool
  const customerRows = await db.insert(schema.customers).values(Array.from({ length: 160 }, (_, i) => ({
    name: `${pick(FIRST)} ${pick(LAST)}`, phone: String(9820000000 + i * 137 + Math.floor(rnd() * 100)), address: `${Math.ceil(rnd() * 40)}/${Math.ceil(rnd() * 9)}, ${pick(AREAS)}, Mira Road East`,
    marketingOptIn: rnd() > 0.1, birthday: rnd() > 0.5 ? `19${80 + Math.floor(rnd() * 25)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}` : null,
  }))).returning();
  const loyal = customerRows.slice(0, 40); // visit often

  const today = businessDate();
  const nowIst = new Date();
  const DAYS = Math.min(Math.max(Number(process.env.DEMO_DAYS) || 42, 1), 90);
  const orderCounter = new Map<string, number>();
  let made = 0;

  for (const outlet of outlets) {
    const staff = users.filter((u) => u.outletId === outlet.id);
    const cashier = staff.find((u) => u.role === "cashier") ?? staff.find((u) => u.role === "franchisee") ?? users[0];
    const riders = staff.filter((u) => u.role === "delivery");
    const tables = await db.select().from(schema.diningTables).where(eq(schema.diningTables.outletId, outlet.id));
    const base = outlet.isFranchise ? 14 : 38;

    for (let back = DAYS; back >= 0; back--) {
      const date = addDays(today, -back);
      const dow = new Date(date + "T00:00:00Z").getUTCDay();
      const growth = 0.75 + ((DAYS - back) / DAYS) * 0.35; // business slowly growing
      const count = Math.round(base * growth * (dow === 0 || dow === 6 ? 1.45 : dow === 1 ? 0.85 : 1) * (0.85 + rnd() * 0.3));
      const slots: number[] = [];
      for (let i = 0; i < count; i++) {
        const h = wpick<number>([[8, 5], [9, 7], [10, 6], [11, 5], [12, 8], [13, 9], [14, 6], [15, 4], [16, 7], [17, 10], [18, 11], [19, 7]]);
        slots.push(h * 60 + Math.floor(rnd() * 60));
      }
      slots.sort((a, b) => a - b);
      for (const minute of slots) {
        const at = new Date(`${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+05:30`);
        if (at.getTime() > nowIst.getTime() - 20 * 60000) continue; // never in the future

        const type = wpick<"dine_in" | "takeaway" | "delivery">([["dine_in", 55], ["takeaway", 25], ["delivery", 20]]);
        const nLines = wpick<number>([[1, 35], [2, 40], [3, 18], [4, 7]]);
        const lines = [];
        const used = new Set<number>();
        for (let i = 0; i < nLines; i++) {
          const it = wpick(weighted);
          if (used.has(it.id)) continue;
          used.add(it.id);
          const g = groupOf(it.id);
          const modifierIds: number[] = [];
          if (g.has(spiceGroup)) modifierIds.push(wpick<number>(spiceMods.map((m, k) => [m.id, [2, 6, 4, 1][k]] as [number, number])));
          if (g.has(prepGroup)) modifierIds.push(rnd() < 0.08 ? jainMod!.id : regularMod!.id);
          if (rnd() < 0.15) { const a = pick(addonMods); if (links.some((l) => l.itemId === it.id && l.groupId === a.groupId)) modifierIds.push(a.id); }
          lines.push({ itemId: it.id, qty: wpick<number>([[1, 70], [2, 22], [3, 6], [4, 2]]), modifierIds });
        }
        if (!lines.length) continue;

        const isRepeat = rnd() < 0.55;
        const cust = isRepeat ? (rnd() < 0.6 ? pick(loyal) : pick(customerRows)) : null;
        const table = type === "dine_in" ? pick(tables) : null;

        // a few discounts / coupons
        const disc = rnd() < 0.06 ? { discountKind: "percent" as const, discountValue: 10, discountReason: "Regular customer" } : {};
        const coupon = rnd() < 0.03 ? "MISAL20" : null;

        let res;
        try {
          res = await saveOrder({
            outletId: outlet.id, userId: cashier.id, type, tableId: table?.id ?? null, covers: type === "dine_in" ? 1 + Math.floor(rnd() * 4) : null,
            customerId: cust?.id, customerName: cust?.name, customerPhone: cust?.phone, deliveryAddress: type === "delivery" ? cust?.address ?? `${Math.ceil(rnd() * 40)}, ${pick(AREAS)}, Mira Road East` : "",
            deliveryFee: type === "delivery" ? (rnd() < 0.7 ? outlet.deliveryFeeNear : outlet.deliveryFeeFar) : 0, lines, couponCode: coupon, ...disc, fireKot: true,
          });
        } catch { continue; }
        const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, res.orderId));
        const method = type === "delivery" ? "online" : wpick<"cash" | "upi" | "card">([["cash", 33], ["upi", 55], ["card", 12]]);
        if (type === "delivery" && riders[0]) await assignDelivery(o.id, pick(riders).id);
        await payOrder(o.id, [{ method, amount: o.total }], cashier.id);
        if (type === "delivery") await markDelivered(o.id);

        const key = `${outlet.id}|${date}`;
        const no = (orderCounter.get(key) ?? 0) + 1;
        orderCounter.set(key, no);
        const closed = new Date(at.getTime() + (12 + Math.floor(rnd() * 25)) * 60000);
        await db.update(schema.orders).set({ businessDate: date, createdAt: at, closedAt: closed, orderNo: String(no).padStart(3, "0"), status: "completed" }).where(eq(schema.orders.id, o.id));
        await db.update(schema.payments).set({ businessDate: date, createdAt: closed }).where(eq(schema.payments.orderId, o.id));
        await db.update(schema.orderItems).set({ createdAt: at, status: "served" }).where(eq(schema.orderItems.orderId, o.id));
        await db.update(schema.kots).set({ createdAt: at }).where(eq(schema.kots.orderId, o.id));
        await db.update(schema.stockMovements).set({ createdAt: at }).where(and(eq(schema.stockMovements.refId, o.id), eq(schema.stockMovements.kind, "sale")));
        await db.update(schema.loyaltyTxns).set({ createdAt: closed }).where(eq(schema.loyaltyTxns.orderId, o.id));
        if (cust) await db.update(schema.customers).set({ lastVisitAt: sql`GREATEST(COALESCE(${schema.customers.lastVisitAt}, ${closed}), ${closed})` }).where(eq(schema.customers.id, cust.id));
        if (rnd() < 0.18) {
          const rating = wpick<number>([[5, 55], [4, 28], [3, 10], [2, 4], [1, 3]]);
          await db.insert(schema.feedback).values({
            outletId: outlet.id, orderId: o.id, customerId: cust?.id, rating, foodRating: Math.min(5, rating + (rnd() < 0.3 ? 1 : 0)), serviceRating: rating,
            comment: rating >= 4 ? pick(["Misal was fantastic!", "Great taste, quick service", "Best misal in Mira Road", "Tari was perfect", "Loved the fry misal", ""]) : pick(["Too much wait", "Pav was cold", "Misal was less spicy", "Packing could be better"]),
            createdAt: closed,
          });
        }
        made++;
      }
      // daily expenses
      await db.insert(schema.expenses).values([
        { outletId: outlet.id, category: "Gas / LPG", amount: Math.round((outlet.isFranchise ? 1500 : 3000) * (0.5 + rnd())) * 100, method: "cash", note: "Daily fuel", expenseDate: date, userId: cashier.id },
        { outletId: outlet.id, category: "Raw material", amount: Math.round((outlet.isFranchise ? 2500 : 7000) * (0.7 + rnd() * 0.6)) * 100, method: rnd() < 0.5 ? "cash" : "upi", note: "Vegetables, dairy, bakery", expenseDate: date, userId: cashier.id },
      ]);
      if (date.endsWith("-01") || back === DAYS) {
        await db.insert(schema.expenses).values([
          { outletId: outlet.id, category: "Rent", amount: (outlet.isFranchise ? 45000 : 65000) * 100, method: "bank", note: "Monthly shop rent", expenseDate: date, userId: cashier.id },
          { outletId: outlet.id, category: "Electricity", amount: (outlet.isFranchise ? 6000 : 9500) * 100, method: "upi", note: "Electricity bill", expenseDate: date, userId: cashier.id },
        ]);
      }
    }
    console.log(`${outlet.name}: done`);
  }
  // Attendance (last 30 days, ~92% present)
  const staffAll = users.filter((u) => u.outletId && !["owner", "admin"].includes(u.role));
  for (let back = 29; back >= 0 && staffAll.length > 0; back--) {
    const date = addDays(today, -back);
    const present = staffAll.filter(() => rnd() < 0.94);
    if (!present.length) continue;
    await db.insert(schema.attendance).values(present.map((u) => ({
      userId: u.id, outletId: u.outletId, workDate: date, status: "present" as const,
      clockIn: new Date(`${date}T0${7 + Math.floor(rnd() * 2)}:${String(10 + Math.floor(rnd() * 45))}:00+05:30`), clockOut: back === 0 ? null : new Date(`${date}T20:${String(Math.floor(rnd() * 40)).padStart(2, "0")}:00+05:30`),
    }))).onConflictDoNothing();
  }

  // Healthy stock with a few items running low; purchases history
  const ings = await db.select().from(schema.ingredients);
  const sup = await db.select().from(schema.suppliers);
  for (const outlet of outlets) {
    await db.execute(sql`UPDATE stock SET qty = min_qty * (1.6 + random() * 2.2) WHERE outlet_id = ${outlet.id}`);
    for (const name of ["Farsan", "Cheese", "Butter", "Kulhad"]) {
      const ing = ings.find((i) => i.name === name)!;
      await db.execute(sql`UPDATE stock SET qty = min_qty * 0.55 WHERE outlet_id = ${outlet.id} AND ingredient_id = ${ing.id}`);
    }
    if (outlet.isFranchise) continue;
    for (let w = 5; w >= 0; w--) {
      const date = addDays(today, -w * 7);
      const chosen = ings.filter(() => rnd() < 0.5);
      const total = chosen.reduce((s, i) => s + Math.round(i.defaultCost * 10), 0);
      const [p] = await db.insert(schema.purchases).values({ outletId: outlet.id, supplierId: pick(sup).id, invoiceNo: `INV-${1000 + w}`, total, paid: total, purchaseDate: date, userId: users[0].id }).returning();
      await db.insert(schema.purchaseItems).values(chosen.map((i) => ({ purchaseId: p.id, ingredientId: i.id, qty: "10", unitCost: i.defaultCost })));
    }
  }

  await db.insert(schema.franchiseLeads).values([
    { name: "Rajesh Mhatre", phone: "9820011122", city: "Thane", budget: "₹8–10 lakh", message: "Interested in a kiosk near Thane station", status: "meeting" },
    { name: "Sunita Pillai", phone: "9833344455", city: "Vasai", budget: "₹5–8 lakh", message: "Want to open a small outlet", status: "contacted" },
    { name: "Imran Shaikh", phone: "9768899001", city: "Bhayandar", budget: "₹10+ lakh", message: "Have a shop ready, looking for brand", status: "new" },
    { name: "Dinesh Pawar", phone: "9930022233", city: "Borivali", budget: "₹5–8 lakh", message: "", status: "agreement" },
    { name: "Kiran Joshi", phone: "9870044556", city: "Dahisar", budget: "₹3–5 lakh", message: "Food truck model?", status: "lost" },
  ]);

  // Live state: a couple of open orders for the kitchen + one pending online order
  const hq = outlets[0];
  const cash = users.find((u) => u.role === "cashier") ?? users[0];
  const hqTables = await db.select().from(schema.diningTables).where(eq(schema.diningTables.outletId, hq.id));
  const byName = (n: string) => allItems.find((i) => i.name === n)!.id;
  await saveOrder({ outletId: hq.id, userId: cash.id, type: "dine_in", tableId: hqTables[1].id, covers: 3, lines: [{ itemId: byName("Misal Pav"), qty: 2, modifierIds: [spiceMods[2].id, regularMod!.id] }, { itemId: byName("Kulhad Tea"), qty: 2 }], fireKot: true });
  await saveOrder({ outletId: hq.id, userId: cash.id, type: "dine_in", tableId: hqTables[3].id, covers: 2, lines: [{ itemId: byName("Fry Misal Pav"), qty: 1, modifierIds: [spiceMods[1].id, regularMod!.id] }, { itemId: byName("Vada Pav"), qty: 2 }], fireKot: true });
  await saveOrder({ outletId: hq.id, userId: cash.id, type: "takeaway", customerName: "Walk-in", lines: [{ itemId: byName("Samosa Pav"), qty: 4 }, { itemId: byName("Kokam Sarbat"), qty: 2 }], fireKot: true });
  await saveOrder({ outletId: hq.id, userId: cash.id, type: "delivery", channel: "website", customerName: "Priya Shah", customerPhone: "9820099887", deliveryAddress: "Flat 402, Silver Park, Mira Road East", deliveryFee: hq.deliveryFeeNear, lines: [{ itemId: byName("Misal Thali"), qty: 2, modifierIds: [spiceMods[1].id, regularMod!.id] }], notes: "Please send extra tari" });

  console.log(`\nDemo data ready: ${made} historical orders, ${customerRows.length} customers.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
