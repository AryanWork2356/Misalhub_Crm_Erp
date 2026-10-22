"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { assignDelivery, cancelOrder, markDelivered, payOrder, refundOrder, sendToKitchen } from "@/lib/orders";
import type { Result } from "./pos";

async function guard(orderId: number, mod: "orders" | "delivery" = "orders") {
  const { user } = await requireUser(mod);
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
  if (!o) throw new Error("Order not found");
  return { user, outletId, order: o };
}

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Accept an online / WhatsApp order: sends it to the kitchen. */
export async function acceptOnlineOrderAction(orderId: number) {
  return run(async () => {
    const { outletId } = await guard(orderId);
    await sendToKitchen(orderId, outletId);
    revalidatePath("/orders");
    return {};
  });
}

export async function rejectOnlineOrderAction(orderId: number, reason: string) {
  return run(async () => {
    const { user } = await guard(orderId);
    await cancelOrder(orderId, reason || "Rejected", user.id);
    revalidatePath("/orders");
    return {};
  });
}

export async function assignDeliveryAction(orderId: number, partnerId: number | null) {
  return run(async () => {
    const { outletId } = await guard(orderId, "delivery");
    if (partnerId) {
      const db = await getDb();
      const [p] = await db.select().from(schema.users).where(and(eq(schema.users.id, partnerId), eq(schema.users.outletId, outletId), eq(schema.users.role, "delivery")));
      if (!p) throw new Error("Invalid delivery partner");
    }
    await assignDelivery(orderId, partnerId);
    revalidatePath("/delivery");
    return {};
  });
}

export async function markDeliveredAction(orderId: number) {
  return run(async () => {
    const { user, order } = await guard(orderId, "delivery");
    if (user.role === "delivery" && order.deliveryPartnerId !== user.id) throw new Error("This delivery is not assigned to you");
    await markDelivered(orderId);
    revalidatePath("/delivery");
    return {};
  });
}

/** Collect payment on delivery (cash/UPI at the door). */
export async function collectDeliveryPaymentAction(orderId: number, method: "cash" | "upi") {
  return run(async () => {
    const { user, order } = await guard(orderId, "delivery");
    if (user.role === "delivery" && order.deliveryPartnerId !== user.id) throw new Error("This delivery is not assigned to you");
    const due = order.total - order.paid;
    if (due > 0) await payOrder(orderId, [{ method, amount: due }], user.id);
    await markDelivered(orderId);
    revalidatePath("/delivery");
    return {};
  });
}

export async function refundOrderAction(orderId: number, reason: string) {
  return run(async () => {
    const { user } = await guard(orderId);
    if (!isManagerUp(user.role)) throw new Error("Only a manager can issue refunds");
    if (!reason.trim()) throw new Error("Give a reason");
    await refundOrder(orderId, reason.trim(), user.id);
    revalidatePath("/orders");
    return {};
  });
}
