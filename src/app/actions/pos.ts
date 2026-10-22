"use server";

import { z } from "zod";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { cancelOrder, cancelOrderLine, payOrder, saveOrder, sendToKitchen, setOrderLinesStatus } from "@/lib/orders";
import { couponAmount } from "@/lib/pricing";
import { businessDate } from "@/lib/dates";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    // Next.js control-flow errors (redirect/notFound) must propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

const orderSchema = z.object({
  orderId: z.number().int().optional(),
  type: z.enum(schema.ORDER_TYPES),
  tableId: z.number().int().nullable().optional(),
  covers: z.number().int().min(1).max(100).nullable().optional(),
  customerId: z.number().int().nullable().optional(),
  customerName: z.string().max(80).optional(),
  customerPhone: z.string().max(20).optional(),
  deliveryAddress: z.string().max(300).optional(),
  deliveryFee: z.number().int().min(0).max(100000).optional(),
  lines: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(1).max(99), modifierIds: z.array(z.number().int()).optional(), notes: z.string().max(200).optional() })).max(100),
  discountKind: z.enum(["none", "percent", "flat"]).optional(),
  discountValue: z.number().int().min(0).optional(),
  discountReason: z.string().max(120).optional(),
  couponCode: z.string().max(30).nullable().optional(),
  loyaltyRedeem: z.number().int().min(0).optional(),
  tip: z.number().int().min(0).optional(),
  notes: z.string().max(300).optional(),
  fireKot: z.boolean().optional(),
});
export type OrderPayload = z.infer<typeof orderSchema>;

/** Discounts above this share of the bill need a manager/owner. */
const CASHIER_MAX_DISCOUNT_PCT = 10;

export async function submitOrderAction(payload: OrderPayload) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const p = orderSchema.parse(payload);
    if (!isManagerUp(user.role)) {
      if ((p.discountKind === "percent" && (p.discountValue ?? 0) > CASHIER_MAX_DISCOUNT_PCT) || (p.discountKind === "flat" && (p.discountValue ?? 0) > 5000))
        throw new Error(`Discounts above ${CASHIER_MAX_DISCOUNT_PCT}% (or ₹50) need a manager`);
    }
    if (p.type === "delivery" && !p.deliveryAddress?.trim()) throw new Error("Delivery address is required");
    if (p.type === "dine_in" && !p.tableId && !p.orderId) throw new Error("Pick a table for dine-in");
    const r = await saveOrder({ ...p, outletId, userId: user.id, channel: "pos" });
    const db = await getDb();
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
    return { orderId: r.orderId, orderNo: r.orderNo, kotNo: r.kotNo ?? null, total: o.total };
  });
}

export async function loadOrderAction(orderId: number) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!order) throw new Error("Order not found");
    const lines = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId)).orderBy(schema.orderItems.id);
    const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
    return { order, lines, payments: pays };
  });
}

export async function searchCustomersAction(q: string) {
  return run(async () => {
    await requireUser("pos");
    const term = q.trim();
    if (term.length < 2) return { customers: [] as (typeof schema.customers.$inferSelect)[] };
    const db = await getDb();
    const rows = await db.select().from(schema.customers)
      .where(or(ilike(schema.customers.phone, `%${term}%`), ilike(schema.customers.name, `%${term}%`)))
      .orderBy(desc(schema.customers.visits)).limit(8);
    return { customers: rows };
  });
}

export async function checkCouponAction(code: string, subtotal: number) {
  return run(async () => {
    await requireUser("pos");
    const db = await getDb();
    const [c] = await db.select().from(schema.coupons).where(eq(schema.coupons.code, code.trim().toUpperCase()));
    const today = businessDate();
    if (!c || !c.active) throw new Error("Invalid coupon");
    if (c.validFrom && c.validFrom > today) throw new Error("Coupon not active yet");
    if (c.validTo && c.validTo < today) throw new Error("Coupon expired");
    if (c.usageLimit != null && c.used >= c.usageLimit) throw new Error("Coupon usage limit reached");
    if (subtotal < c.minOrder) throw new Error(`Minimum order ₹${c.minOrder / 100} for this coupon`);
    return { code: c.code, description: c.description, amount: couponAmount(c, subtotal) };
  });
}

export async function sendKotAction(orderId: number) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const kotNo = await sendToKitchen(orderId, outletId);
    return { kotNo: kotNo ?? null };
  });
}

const paySchema = z.array(z.object({ method: z.enum(schema.PAYMENT_METHODS), amount: z.number().int().min(1), reference: z.string().max(60).optional() })).min(1);

export async function payOrderAction(orderId: number, payments: z.infer<typeof paySchema>) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!o) throw new Error("Order not found");
    const res = await payOrder(orderId, paySchema.parse(payments), user.id);
    return { change: res.change, fullyPaid: res.fullyPaid };
  });
}

export async function cancelOrderAction(orderId: number, reason: string) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!o) throw new Error("Order not found");
    if (!reason.trim()) throw new Error("Give a reason");
    const lines = await db.select({ kotId: schema.orderItems.kotId }).from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
    if (lines.some((l) => l.kotId) && !isManagerUp(user.role)) throw new Error("Only a manager can cancel an order after the KOT is sent");
    await cancelOrder(orderId, reason.trim(), user.id);
    return {};
  });
}

export async function cancelLineAction(lineId: number, reason: string) {
  return run(async () => {
    const { user } = await requireUser("pos");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [row] = await db.select({ kotId: schema.orderItems.kotId, outletId: schema.orders.outletId }).from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId)).where(eq(schema.orderItems.id, lineId));
    if (!row || row.outletId !== outletId) throw new Error("Item not found");
    if (!reason.trim()) throw new Error("Give a reason");
    if (row.kotId && !isManagerUp(user.role)) throw new Error("Only a manager can cancel an item after the KOT is sent");
    await cancelOrderLine(lineId, reason.trim(), user.id);
    return {};
  });
}

export async function markServedAction(orderId: number) {
  return run(async () => {
    const { user } = await requireUser("orders");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!o) throw new Error("Order not found");
    await setOrderLinesStatus(orderId, "served");
    return {};
  });
}

export async function receiptAction(orderId: number) {
  return run(async () => {
    const { user } = await requireUser();
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!order) throw new Error("Order not found");
    const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId));
    const lines = await db.select().from(schema.orderItems).where(and(eq(schema.orderItems.orderId, orderId)));
    const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
    let table: string | null = null;
    if (order.tableId) {
      const [t] = await db.select({ name: schema.diningTables.name }).from(schema.diningTables).where(eq(schema.diningTables.id, order.tableId));
      table = t?.name ?? null;
    }
    return { order, outlet, lines: lines.filter((l) => l.status !== "cancelled"), payments: pays, table };
  });
}

/** Kitchen-ticket data (unsent or all lines) for printing a KOT slip. */
export async function kotSlipAction(orderId: number) {
  return run(async () => {
    const { user } = await requireUser();
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
    if (!order) throw new Error("Order not found");
    const kotRows = await db.select().from(schema.kots).where(eq(schema.kots.orderId, orderId)).orderBy(desc(schema.kots.id)).limit(1);
    const lines = kotRows[0] ? await db.select().from(schema.orderItems).where(and(eq(schema.orderItems.orderId, orderId), inArray(schema.orderItems.kotId, [kotRows[0].id]))) : [];
    let table: string | null = null;
    if (order.tableId) {
      const [t] = await db.select({ name: schema.diningTables.name }).from(schema.diningTables).where(eq(schema.diningTables.id, order.tableId));
      table = t?.name ?? null;
    }
    return { order, kotNo: kotRows[0]?.kotNo ?? null, lines, table };
  });
}
