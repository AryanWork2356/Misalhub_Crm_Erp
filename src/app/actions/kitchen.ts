"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { setItemStatus, setOrderLinesStatus } from "@/lib/orders";

async function ownOrder(orderId: number) {
  const { user } = await requireUser("kds");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.id, orderId), eq(schema.orders.outletId, outletId)));
  if (!o) throw new Error("Order not found");
}

export async function kdsOrderStatusAction(orderId: number, status: "preparing" | "ready" | "served", station?: string) {
  await ownOrder(orderId);
  await setOrderLinesStatus(orderId, status, station);
}

export async function kdsItemStatusAction(itemId: number, status: "preparing" | "ready" | "served") {
  const { user } = await requireUser("kds");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const [row] = await db.select({ outletId: schema.orders.outletId }).from(schema.orderItems)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.orderItems.orderId)).where(eq(schema.orderItems.id, itemId));
  if (!row || row.outletId !== outletId) throw new Error("Item not found");
  await setItemStatus(itemId, status);
}

export async function setItemAvailabilityAction(itemId: number, available: boolean) {
  const { user } = await requireUser();
  if (!["kitchen", "manager", "owner", "admin", "franchisee"].includes(user.role)) throw new Error("Not allowed");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  await db.insert(schema.outletItems).values({ outletId, itemId, available }).onConflictDoUpdate({
    target: [schema.outletItems.outletId, schema.outletItems.itemId], set: { available },
  });
}
