import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/db";
import { businessDate } from "./dates";
import { publish } from "./events";
import { computeTotals, couponAmount, manualDiscount } from "./pricing";
import type { OrderType, PaymentMethod } from "@/db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const { orders, orderItems, items, modifiers, itemModifierGroups, outlets, outletItems, kots, payments, customers, coupons, loyaltyTxns, recipes, stock, stockMovements } = schema;

export type CartLine = { itemId: number; qty: number; modifierIds?: number[]; notes?: string };

export type OrderInput = {
  orderId?: number;
  outletId: number;
  /** Staff member taking the order; null/omitted for guest (website / QR) orders. */
  userId?: number | null;
  type: OrderType;
  channel?: (typeof schema.ORDER_CHANNELS)[number];
  tableId?: number | null;
  covers?: number | null;
  customerId?: number | null;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
  /** New (not yet sent to kitchen) lines. Replaces any existing unsent lines. */
  lines: CartLine[];
  discountKind?: "none" | "percent" | "flat";
  discountValue?: number;
  discountReason?: string;
  couponCode?: string | null;
  loyaltyRedeem?: number;
  tip?: number;
  notes?: string;
  scheduledFor?: Date | null;
  fireKot?: boolean;
};


/** Look up or create the customer record for a phone number. */
async function resolveCustomer(tx: Tx, input: { customerId?: number | null; customerName?: string; customerPhone?: string }) {
  if (input.customerId) return input.customerId;
  const phone = (input.customerPhone ?? "").replace(/\D/g, "").slice(-10);
  if (phone.length < 10) return null;
  const [existing] = await tx.select().from(customers).where(eq(customers.phone, phone));
  if (existing) {
    if (input.customerName && !existing.name) await tx.update(customers).set({ name: input.customerName }).where(eq(customers.id, existing.id));
    return existing.id;
  }
  const [c] = await tx.insert(customers).values({ phone, name: input.customerName ?? "" }).returning({ id: customers.id });
  return c.id;
}

async function nextOrderNo(tx: Tx, outletId: number, date: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${outletId})`);
  const r = await tx.execute(sql`SELECT COALESCE(MAX(order_no::int), 0) + 1 AS n FROM orders WHERE outlet_id = ${outletId} AND business_date = ${date} AND order_no ~ '^[0-9]+$'`);
  const n = Number((r.rows[0] as { n: number | string }).n);
  return String(n).padStart(3, "0");
}

/** Build order_items rows from a cart using authoritative prices from the database. */
async function resolveLines(tx: Tx, outletId: number, lines: CartLine[]) {
  if (!lines.length) return [];
  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const itemRows = await tx.select().from(items).where(inArray(items.id, itemIds));
  const overrides = await tx.select().from(outletItems).where(and(eq(outletItems.outletId, outletId), inArray(outletItems.itemId, itemIds)));
  const ov = new Map(overrides.map((o) => [o.itemId, o]));
  const modIds = [...new Set(lines.flatMap((l) => l.modifierIds ?? []))];
  const modRows = modIds.length ? await tx.select().from(modifiers).where(inArray(modifiers.id, modIds)) : [];
  const modMap = new Map(modRows.map((m) => [m.id, m]));
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  // a modifier is only valid if it belongs to a group attached to that item
  const itemGroups = await tx.select().from(itemModifierGroups).where(inArray(itemModifierGroups.itemId, itemIds));
  const allowed = new Map<number, Set<number>>();
  for (const g of itemGroups) allowed.set(g.itemId, (allowed.get(g.itemId) ?? new Set()).add(g.groupId));

  return lines.map((l) => {
    const it = itemMap.get(l.itemId);
    if (!it || !it.active) throw new Error("An item in the cart is no longer available");
    const o = ov.get(it.id);
    if (o && !o.available) throw new Error(`${it.name} is out of stock`);
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 99) throw new Error("Invalid quantity");
    const mods = (l.modifierIds ?? []).map((id) => {
      const m = modMap.get(id);
      if (!m || !allowed.get(l.itemId)?.has(m.groupId)) throw new Error("Invalid modifier");
      return { id: m.id, name: m.name, price: m.price };
    });
    const unit = (o?.price ?? it.price) + mods.reduce((s, m) => s + m.price, 0);
    return {
      itemId: it.id, name: it.name, variant: "", qty: l.qty, unitPrice: unit, taxPct: it.taxPct,
      modifiers: mods, notes: (l.notes ?? "").slice(0, 200), station: it.station, lineTotal: unit * l.qty,
    };
  });
}

/** Recompute subtotal / discount / tax / total from the order's live lines. */
export async function recalcOrder(tx: Tx, orderId: number) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, order.outletId));
  const lines = await tx.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "cancelled")));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  const manual = manualDiscount(order.discountKind, order.discountValue, subtotal);

  let couponDiscount = 0;
  let couponCode = order.couponCode;
  if (couponCode) {
    const [c] = await tx.select().from(coupons).where(eq(coupons.code, couponCode));
    const today = businessDate();
    const valid = c && c.active && (!c.validFrom || c.validFrom <= today) && (!c.validTo || c.validTo >= today) && (c.usageLimit == null || c.used < c.usageLimit);
    couponDiscount = valid ? couponAmount(c, subtotal) : 0;
    if (!couponDiscount) couponCode = null;
  }

  let discount = Math.min(subtotal, manual + couponDiscount);
  // Loyalty: 1 point = ₹1
  if (order.loyaltyRedeemed > 0) discount += Math.min(order.loyaltyRedeemed * 100, subtotal - discount);

  const t = computeTotals({ lines, discount, deliveryFee: order.deliveryFee, tip: order.tip, taxInclusive: outlet.taxInclusive, gstOn: outlet.gstOn });
  const total = t.total;

  await tx.update(orders).set({
    subtotal: t.subtotal, discount: t.discount, couponDiscount, couponCode, tax: t.tax, roundOff: t.roundOff, total,
    paymentStatus: order.paid >= total && total > 0 ? "paid" : order.paid > 0 ? "partial" : "unpaid",
  }).where(eq(orders.id, orderId));
  return { subtotal: t.subtotal, discount: t.discount, tax: t.tax, total };
}

/** Create or update an order from the POS / online channels. Returns the order id. */
export async function saveOrder(input: OrderInput): Promise<{ orderId: number; orderNo: string; kotNo?: number }> {
  const db = await getDb();
  const out = await db.transaction(async (tx) => {
    const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, input.outletId));
    if (!outlet) throw new Error("Unknown outlet");
    const customerId = await resolveCustomer(tx, input);
    const newLines = await resolveLines(tx, input.outletId, input.lines);
    const date = businessDate();

    let orderId = input.orderId;
    let orderNo: string;
    if (orderId) {
      const [existing] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.outletId, input.outletId)));
      if (!existing) throw new Error("Order not found");
      if (existing.status === "completed" || existing.status === "cancelled") throw new Error("This order is already closed");
      orderNo = existing.orderNo;
      await tx.delete(orderItems).where(and(eq(orderItems.orderId, orderId), sql`${orderItems.kotId} IS NULL`));
      await tx.update(orders).set({
        type: input.type, tableId: input.type === "dine_in" ? input.tableId ?? null : null, covers: input.covers ?? existing.covers,
        customerId: customerId ?? existing.customerId, customerName: input.customerName ?? existing.customerName,
        customerPhone: input.customerPhone ?? existing.customerPhone, deliveryAddress: input.deliveryAddress ?? existing.deliveryAddress,
        deliveryFee: input.type === "delivery" ? input.deliveryFee ?? existing.deliveryFee : 0,
        discountKind: input.discountKind ?? existing.discountKind, discountValue: input.discountValue ?? existing.discountValue,
        discountReason: input.discountReason ?? existing.discountReason, couponCode: input.couponCode === undefined ? existing.couponCode : input.couponCode,
        loyaltyRedeemed: input.loyaltyRedeem ?? existing.loyaltyRedeemed, tip: input.tip ?? existing.tip, notes: input.notes ?? existing.notes,
        scheduledFor: input.scheduledFor === undefined ? existing.scheduledFor : input.scheduledFor,
      }).where(eq(orders.id, orderId));
    } else {
      if (!newLines.length) throw new Error("Add at least one item");
      if (input.type === "dine_in" && input.tableId) {
        const busy = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tableId, input.tableId), inArray(orders.status, ["new", "preparing", "ready", "served"])));
        if (busy.length) throw new Error("That table already has an open order");
      }
      orderNo = await nextOrderNo(tx, input.outletId, date);
      const [o] = await tx.insert(orders).values({
        outletId: input.outletId, orderNo, type: input.type, channel: input.channel ?? "pos",
        tableId: input.type === "dine_in" ? input.tableId ?? null : null, covers: input.covers ?? null, customerId,
        customerName: input.customerName ?? "", customerPhone: input.customerPhone ?? "", deliveryAddress: input.deliveryAddress ?? "",
        deliveryFee: input.type === "delivery" ? input.deliveryFee ?? 0 : 0,
        discountKind: input.discountKind ?? "none", discountValue: input.discountValue ?? 0, discountReason: input.discountReason ?? "",
        couponCode: input.couponCode ?? null, loyaltyRedeemed: input.loyaltyRedeem ?? 0, tip: input.tip ?? 0, notes: input.notes ?? "",
        scheduledFor: input.scheduledFor ?? null, waiterId: input.userId ?? null, cashierId: input.userId ?? null, businessDate: date,
      }).returning({ id: orders.id });
      orderId = o.id;
    }

    if (newLines.length) await tx.insert(orderItems).values(newLines.map((l) => ({ ...l, orderId: orderId! })));
    let kotNo: number | undefined;
    if (input.fireKot) kotNo = await fireKot(tx, orderId!, input.outletId);
    await recalcOrder(tx, orderId!);
    return { orderId: orderId!, orderNo, kotNo };
  });
  publish({ type: "order", outletId: input.outletId, orderId: out.orderId });
  return out;
}

/** Send all unsent lines to the kitchen as a new KOT and deduct recipe stock. */
export async function fireKot(tx: Tx, orderId: number, outletId: number): Promise<number | undefined> {
  const pending = await tx.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), sql`${orderItems.kotId} IS NULL`, ne(orderItems.status, "cancelled")));
  if (!pending.length) return undefined;
  const r = await tx.execute(sql`SELECT COALESCE(MAX(kot_no), 0) + 1 AS n FROM kots WHERE outlet_id = ${outletId} AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = ${businessDate()}::date`);
  const kotNo = Number((r.rows[0] as { n: number | string }).n);
  const [k] = await tx.insert(kots).values({ orderId, outletId, kotNo }).returning({ id: kots.id });
  await tx.update(orderItems).set({ kotId: k.id }).where(inArray(orderItems.id, pending.map((p) => p.id)));

  // Recipe-based stock deduction
  const itemIds = [...new Set(pending.map((p) => p.itemId))];
  const rec = await tx.select().from(recipes).where(inArray(recipes.itemId, itemIds));
  const usage = new Map<number, number>();
  for (const line of pending) for (const rr of rec.filter((x) => x.itemId === line.itemId)) usage.set(rr.ingredientId, (usage.get(rr.ingredientId) ?? 0) + Number(rr.qty) * line.qty);
  for (const [ingredientId, qty] of usage) {
    const [s] = await tx.select().from(stock).where(and(eq(stock.outletId, outletId), eq(stock.ingredientId, ingredientId)));
    if (!s) continue;
    await tx.update(stock).set({ qty: sql`${stock.qty} - ${qty}` }).where(and(eq(stock.outletId, outletId), eq(stock.ingredientId, ingredientId)));
    await tx.insert(stockMovements).values({ outletId, ingredientId, kind: "sale", qty: String(-qty), unitCost: s.avgCost, refId: orderId });
  }
  return kotNo;
}

export async function sendToKitchen(orderId: number, outletId: number) {
  const db = await getDb();
  const kotNo = await db.transaction(async (tx) => {
    const k = await fireKot(tx, orderId, outletId);
    await recalcOrder(tx, orderId);
    return k;
  });
  publish({ type: "order", outletId, orderId });
  return kotNo;
}

export async function setItemStatus(itemRowId: number, status: "preparing" | "ready" | "served") {
  const db = await getDb();
  const [row] = await db.select().from(orderItems).where(eq(orderItems.id, itemRowId));
  if (!row) throw new Error("Item not found");
  await db.transaction(async (tx) => {
    await tx.update(orderItems).set({ status }).where(eq(orderItems.id, itemRowId));
    await syncOrderStatus(tx, row.orderId);
  });
  const [o] = await db.select({ outletId: orders.outletId }).from(orders).where(eq(orders.id, row.orderId));
  publish({ type: "order", outletId: o.outletId, orderId: row.orderId });
}

/** Mark every active line of an order (optionally one station) with a status. */
export async function setOrderLinesStatus(orderId: number, status: "preparing" | "ready" | "served", station?: string) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const conds = [eq(orderItems.orderId, orderId), ne(orderItems.status, "cancelled"), sql`${orderItems.kotId} IS NOT NULL`];
    if (station) conds.push(eq(orderItems.station, station));
    await tx.update(orderItems).set({ status }).where(and(...conds));
    await syncOrderStatus(tx, orderId);
  });
  const [o] = await db.select({ outletId: orders.outletId }).from(orders).where(eq(orders.id, orderId));
  publish({ type: "order", outletId: o.outletId, orderId });
}

async function syncOrderStatus(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (["completed", "cancelled", "out_for_delivery"].includes(o.status)) return;
  const lines = await tx.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "cancelled"), sql`${orderItems.kotId} IS NOT NULL`));
  if (!lines.length) return;
  let status: typeof o.status = "new";
  if (lines.every((l) => l.status === "served")) status = "served";
  else if (lines.every((l) => l.status === "ready" || l.status === "served")) status = "ready";
  else if (lines.some((l) => l.status !== "pending")) status = "preparing";
  if (status !== o.status) await tx.update(orders).set({ status }).where(eq(orders.id, orderId));
}

export async function cancelOrderLine(itemRowId: number, reason: string, userId: number) {
  const db = await getDb();
  const [row] = await db.select().from(orderItems).where(eq(orderItems.id, itemRowId));
  if (!row) throw new Error("Item not found");
  const [o] = await db.select().from(orders).where(eq(orders.id, row.orderId));
  if (o.status === "completed" || o.status === "cancelled") throw new Error("Order already closed");
  await db.transaction(async (tx) => {
    await tx.update(orderItems).set({ status: "cancelled", notes: `${row.notes} [cancelled: ${reason}]`.trim() }).where(eq(orderItems.id, itemRowId));
    await recalcOrder(tx, row.orderId);
    await tx.insert(schema.auditLogs).values({ userId, outletId: o.outletId, action: "cancel_item", entity: "order", entityId: String(o.id), detail: `${row.name} x${row.qty}: ${reason}` });
  });
  publish({ type: "order", outletId: o.outletId, orderId: o.id });
}

export async function cancelOrder(orderId: number, reason: string, userId: number) {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  if (o.status === "completed") throw new Error("Completed orders can't be cancelled — issue a refund instead");
  if (o.paid > 0) throw new Error("Order has payments recorded — refund them first");
  await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: "cancelled", cancelReason: reason, closedAt: new Date() }).where(eq(orders.id, orderId));
    await tx.update(orderItems).set({ status: "cancelled" }).where(eq(orderItems.orderId, orderId));
    await tx.insert(schema.auditLogs).values({ userId, outletId: o.outletId, action: "cancel_order", entity: "order", entityId: String(orderId), detail: `#${o.orderNo} ${reason}` });
  });
  publish({ type: "order", outletId: o.outletId, orderId });
}

export type PaymentInput = { method: PaymentMethod; amount: number; reference?: string };

/** Record one or more payments (split bill supported). Closes dine-in/takeaway orders when fully paid. */
export async function payOrder(orderId: number, pays: PaymentInput[], userId: number) {
  const db = await getDb();
  const res = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
    if (!o) throw new Error("Order not found");
    if (o.status === "cancelled") throw new Error("Order is cancelled");
    await recalcOrder(tx, orderId);
    const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId));
    const clean = pays.filter((p) => p.amount > 0);
    if (!clean.length) throw new Error("Enter a payment amount");
    const due = fresh.total - fresh.paid;
    const sum = clean.reduce((s, p) => s + p.amount, 0);
    // Anything tendered beyond the amount due is change handed back, so only record up to what's due.
    let remaining = due;
    const toInsert = clean.map((p) => {
      const amt = Math.min(p.amount, Math.max(remaining, 0));
      remaining -= amt;
      return { ...p, amount: amt };
    }).filter((p) => p.amount > 0);
    for (const p of toInsert) {
      await tx.insert(payments).values({ orderId, outletId: fresh.outletId, method: p.method, amount: p.amount, reference: p.reference ?? "", userId, businessDate: businessDate() });
    }
    const paid = fresh.paid + toInsert.reduce((s, p) => s + p.amount, 0);
    const fullyPaid = paid >= fresh.total;
    await tx.update(orders).set({ paid, paymentStatus: fullyPaid ? "paid" : paid > 0 ? "partial" : "unpaid", billPrinted: true }).where(eq(orders.id, orderId));
    if (fullyPaid && (fresh.type === "dine_in" || fresh.type === "takeaway")) await completeOrder(tx, orderId);
    return { change: Math.max(sum - due, 0), paid, fullyPaid };
  });
  const [o] = await db.select({ outletId: orders.outletId }).from(orders).where(eq(orders.id, orderId));
  publish({ type: "order", outletId: o.outletId, orderId });
  return res;
}

/** Close an order: set status, update customer stats, loyalty and coupon usage. */
export async function completeOrder(tx: Tx, orderId: number) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (o.status === "completed") return;
  const [outlet] = await tx.select().from(outlets).where(eq(outlets.id, o.outletId));
  await tx.update(orders).set({ status: "completed", closedAt: new Date() }).where(eq(orders.id, orderId));
  await tx.update(orderItems).set({ status: "served" }).where(and(eq(orderItems.orderId, orderId), ne(orderItems.status, "cancelled")));
  if (o.couponCode) await tx.update(coupons).set({ used: sql`${coupons.used} + 1` }).where(eq(coupons.code, o.couponCode));
  if (o.customerId) {
    const earn = outlet.loyaltyEnabled ? Math.floor((o.total * outlet.loyaltyEarnPct) / 100 / 100) : 0;
    await tx.update(customers).set({
      totalSpent: sql`${customers.totalSpent} + ${o.total}`, visits: sql`${customers.visits} + 1`, lastVisitAt: new Date(),
      loyaltyPoints: sql`${customers.loyaltyPoints} + ${earn} - ${o.loyaltyRedeemed}`,
    }).where(eq(customers.id, o.customerId));
    if (earn) await tx.insert(loyaltyTxns).values({ customerId: o.customerId, orderId, points: earn, kind: "earn", note: `Order #${o.orderNo}` });
    if (o.loyaltyRedeemed) await tx.insert(loyaltyTxns).values({ customerId: o.customerId, orderId, points: -o.loyaltyRedeemed, kind: "redeem", note: `Order #${o.orderNo}` });
  }
}

export async function markDelivered(orderId: number) {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  await db.transaction(async (tx) => {
    if (o.paid >= o.total) await completeOrder(tx, orderId);
    else await tx.update(orders).set({ status: "served" }).where(eq(orders.id, orderId));
  });
  publish({ type: "order", outletId: o.outletId, orderId });
}

export async function assignDelivery(orderId: number, partnerId: number | null) {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  await db.update(orders).set({ deliveryPartnerId: partnerId, status: partnerId ? "out_for_delivery" : o.status }).where(eq(orders.id, orderId));
  publish({ type: "order", outletId: o.outletId, orderId });
}

/** Refund a completed order's payment (manager only; caller must check role). */
export async function refundOrder(orderId: number, reason: string, userId: number) {
  const db = await getDb();
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new Error("Order not found");
  await db.transaction(async (tx) => {
    const pays = await tx.select().from(payments).where(eq(payments.orderId, orderId));
    for (const p of pays.filter((x) => x.amount > 0)) {
      await tx.insert(payments).values({ orderId, outletId: o.outletId, method: p.method, amount: -p.amount, reference: `refund: ${reason}`.slice(0, 120), userId, businessDate: businessDate() });
    }
    await tx.update(orders).set({ paid: 0, paymentStatus: "refunded", status: "cancelled", cancelReason: `Refunded: ${reason}`, closedAt: new Date() }).where(eq(orders.id, orderId));
    if (o.customerId && o.status === "completed") {
      await tx.update(customers).set({ totalSpent: sql`GREATEST(${customers.totalSpent} - ${o.total}, 0)`, visits: sql`GREATEST(${customers.visits} - 1, 0)` }).where(eq(customers.id, o.customerId));
    }
    await tx.insert(schema.auditLogs).values({ userId, outletId: o.outletId, action: "refund", entity: "order", entityId: String(orderId), detail: `#${o.orderNo} ${reason}` });
  });
  publish({ type: "order", outletId: o.outletId, orderId });
}
