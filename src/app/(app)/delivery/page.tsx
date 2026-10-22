import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { PageHeader, Empty } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import DeliveryBoard, { type DeliveryOrder } from "./delivery-board";

export const metadata = { title: "Delivery" };
export const dynamic = "force-dynamic";

export default async function DeliveryPage() {
  const { user } = await requireUser("delivery");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const conds = [eq(schema.orders.outletId, outletId), eq(schema.orders.type, "delivery"), inArray(schema.orders.status, ["new", "preparing", "ready", "served", "out_for_delivery"])];
  if (user.role === "delivery") conds.push(eq(schema.orders.deliveryPartnerId, user.id));
  const orders = await db.select().from(schema.orders).where(and(...conds)).orderBy(schema.orders.createdAt);
  const partners = await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
    .where(and(eq(schema.users.outletId, outletId), eq(schema.users.role, "delivery"), eq(schema.users.active, true)));
  const items = orders.length ? await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, orders.map((o) => o.id))) : [];

  const list: DeliveryOrder[] = orders.map((o) => ({
    id: o.id, orderNo: o.orderNo, status: o.status, customerName: o.customerName, phone: o.customerPhone, address: o.deliveryAddress, total: o.total, paid: o.paid,
    partnerId: o.deliveryPartnerId, createdAt: o.createdAt.toISOString(), items: items.filter((i) => i.orderId === o.id && i.status !== "cancelled").map((i) => `${i.qty} × ${i.name}`),
  }));

  return (
    <div>
      <LiveRefresh />
      <PageHeader title="Delivery" subtitle={user.role === "delivery" ? "Your assigned deliveries" : "Assign riders and track deliveries"} />
      {list.length === 0 ? <div className="card"><Empty>No active deliveries.</Empty></div> : <DeliveryBoard orders={list} partners={partners} canAssign={user.role !== "delivery"} />}
    </div>
  );
}
