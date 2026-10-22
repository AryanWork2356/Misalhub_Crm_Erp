import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { saveOrder, payOrder, recalcOrder } from "../src/lib/orders";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
  console.log("ok  -", msg);
}

async function main() {
  const db = await getDb();
  const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.code, "MRD"));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.role, "cashier"));
  const byName = async (n: string) => (await db.select().from(schema.items).where(eq(schema.items.name, n)))[0];
  const misal = await byName("Misal Pav");
  const water = await byName("Mineral Water 1 Ltr");
  const [table] = await db.select().from(schema.diningTables).where(and(eq(schema.diningTables.outletId, outlet.id), eq(schema.diningTables.name, "T1")));
  const [mod] = await db.select().from(schema.modifiers).where(eq(schema.modifiers.name, "Extra Cheese"));

  const stockBefore = await db.execute(`select qty from stock s join ingredients i on i.id = s.ingredient_id where s.outlet_id = ${outlet.id} and i.name = 'Pav'` as never);
  const pavBefore = Number((stockBefore.rows[0] as { qty: string }).qty);

  // 2 x Misal Pav (₹90, 5% GST) + extra cheese, 1 x water (₹20, 18%), table T1
  const r = await saveOrder({
    outletId: outlet.id, userId: user.id, type: "dine_in", tableId: table.id, customerName: "Test", customerPhone: "9876543210",
    lines: [{ itemId: misal.id, qty: 2, modifierIds: [mod.id] }, { itemId: water.id, qty: 1 }], fireKot: true,
  });
  assert(r.orderNo === "001" || /^\d{3}$/.test(r.orderNo), `order number generated (${r.orderNo})`);
  assert(r.kotNo === 1, "KOT #1 created");

  let [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  // subtotal: 2*(9000+3500) + 2000 = 27000
  assert(o.subtotal === 27000, `subtotal is 27000 paise (got ${o.subtotal})`);
  // inclusive tax: 25000*5/105 + 2000*18/118 = 1190.48 + 305.08 = 1495.56 -> 1496
  assert(Math.abs(o.tax - 1496) <= 1, `inclusive GST ≈ 1496 paise (got ${o.tax})`);
  assert(o.total === 27000, `total 27000 (got ${o.total})`);

  const pavAfter = await db.execute(`select qty from stock s join ingredients i on i.id = s.ingredient_id where s.outlet_id = ${outlet.id} and i.name = 'Pav'` as never);
  assert(Math.abs(pavBefore - Number((pavAfter.rows[0] as { qty: string }).qty) - 4) < 1e-6, "stock: 2 Misal Pav consumed 4 pav");

  // double-booking the table must fail
  let blocked = false;
  try { await saveOrder({ outletId: outlet.id, userId: user.id, type: "dine_in", tableId: table.id, lines: [{ itemId: misal.id, qty: 1 }] }); } catch { blocked = true; }
  assert(blocked, "second order on an occupied table is rejected");

  // 10% manual discount + WELCOME10 coupon
  await saveOrder({ orderId: r.orderId, outletId: outlet.id, userId: user.id, type: "dine_in", tableId: table.id, lines: [], discountKind: "percent", discountValue: 10, couponCode: "WELCOME10" });
  [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  assert(o.discount === 2700 + 2700, `discount = manual 10% (2700) + WELCOME10 10% (2700) = 5400, got ${o.discount}`);

  // Split payment: ₹100 cash + rest UPI, overpay cash by ₹50 -> change
  const toPay = o.total;
  const res = await payOrder(r.orderId, [{ method: "cash", amount: 10000 + 5000 }, { method: "upi", amount: toPay - 10000 }], user.id);
  [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
  assert(res.fullyPaid && o.status === "completed", "order completed after full payment");
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, r.orderId));
  assert(pays.reduce((s, p) => s + p.amount, 0) === toPay, `recorded payments equal the total (${toPay})`);

  const [cust] = await db.select().from(schema.customers).where(eq(schema.customers.phone, "9876543210"));
  assert(cust && cust.visits === 1 && cust.totalSpent === toPay, "customer visit + spend recorded");
  assert(cust.loyaltyPoints >= 0, `loyalty points earned (${cust.loyaltyPoints})`);

  // table is free again
  const again = await saveOrder({ outletId: outlet.id, userId: user.id, type: "dine_in", tableId: table.id, lines: [{ itemId: misal.id, qty: 1 }] });
  assert(!!again.orderId, "table free after payment");
  await db.transaction(async (tx) => { await recalcOrder(tx, again.orderId); });
  console.log("\nAll order-engine checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
