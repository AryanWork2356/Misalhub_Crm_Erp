import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { LiveRefresh } from "@/components/live-refresh";
import KdsBoard, { type KdsTicket } from "./kds-board";

export const metadata = { title: "Kitchen" };
export const dynamic = "force-dynamic";

export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const { user } = await requireUser("kds");
  const outletId = await currentOutletId(user);
  const station = (await searchParams).station ?? "all";
  const db = await getDb();

  const orders = await db.select().from(schema.orders)
    .where(and(eq(schema.orders.outletId, outletId), inArray(schema.orders.status, ["new", "preparing", "ready"]))).orderBy(asc(schema.orders.createdAt));
  const lines = orders.length
    ? await db.select().from(schema.orderItems).where(and(inArray(schema.orderItems.orderId, orders.map((o) => o.id)), ne(schema.orderItems.status, "cancelled"), ne(schema.orderItems.status, "served"), sql`${schema.orderItems.kotId} IS NOT NULL`)).orderBy(asc(schema.orderItems.id))
    : [];
  const tables = await db.select().from(schema.diningTables).where(eq(schema.diningTables.outletId, outletId));
  const tname = new Map(tables.map((t) => [t.id, t.name]));
  const items = await db.select({ id: schema.items.id, name: schema.items.name, prep: schema.items.prepMinutes }).from(schema.items);
  const prep = new Map(items.map((i) => [i.id, i.prep]));

  const tickets: KdsTicket[] = orders.map((o) => {
    const ls = lines.filter((l) => l.orderId === o.id && (station === "all" || l.station === station));
    return {
      id: o.id, orderNo: o.orderNo, type: o.type, channel: o.channel, table: o.tableId ? tname.get(o.tableId) ?? null : null, notes: o.notes,
      createdAt: o.createdAt.toISOString(), customerName: o.customerName,
      lines: ls.map((l) => ({ id: l.id, name: l.name, qty: l.qty, status: l.status, modifiers: l.modifiers.map((m) => m.name), notes: l.notes, station: l.station, prep: prep.get(l.itemId) ?? 8 })),
    };
  }).filter((t) => t.lines.length > 0);

  return (
    <div className="min-h-screen bg-stone-900 p-3 text-white">
      <LiveRefresh pollMs={15000} />
      <KdsBoard tickets={tickets} station={station} />
    </div>
  );
}
