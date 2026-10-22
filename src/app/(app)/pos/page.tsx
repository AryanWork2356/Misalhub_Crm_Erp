import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import PosClient, { type PosData } from "./pos-client";

export const metadata = { title: "POS" };
export const dynamic = "force-dynamic";

export default async function PosPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { user } = await requireUser("pos");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const sp = await searchParams;

  const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId));
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.active, true)).orderBy(asc(schema.categories.sortOrder));
  const catOrder = new Map(cats.map((c, i) => [c.id, i]));
  const itemRows = (await db.select().from(schema.items).where(eq(schema.items.active, true)).orderBy(asc(schema.items.sortOrder), asc(schema.items.name)))
    .sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.sortOrder - b.sortOrder);
  const overrides = await db.select().from(schema.outletItems).where(eq(schema.outletItems.outletId, outletId));
  const ov = new Map(overrides.map((o) => [o.itemId, o]));
  const links = await db.select().from(schema.itemModifierGroups);
  const groups = await db.select().from(schema.modifierGroups);
  const mods = await db.select().from(schema.modifiers);
  const groupMap = new Map(groups.map((g) => [g.id, { id: g.id, name: g.name, min: g.minSelect, max: g.maxSelect, mods: mods.filter((m) => m.groupId === g.id).map((m) => ({ id: m.id, name: m.name, price: m.price, isDefault: m.isDefault })) }]));

  const tables = await db.select().from(schema.diningTables).where(and(eq(schema.diningTables.outletId, outletId), eq(schema.diningTables.active, true))).orderBy(asc(schema.diningTables.section), asc(schema.diningTables.name));
  const open = await db.select().from(schema.orders).where(and(eq(schema.orders.outletId, outletId), inArray(schema.orders.status, ["new", "preparing", "ready", "served", "out_for_delivery"]))).orderBy(asc(schema.orders.createdAt));

  const data: PosData = {
    outlet: { id: outlet.id, name: outlet.name, taxInclusive: outlet.taxInclusive, gstOn: outlet.gstOn, upiId: outlet.upiId, deliveryFeeNear: outlet.deliveryFeeNear, deliveryFeeFar: outlet.deliveryFeeFar, loyaltyEnabled: outlet.loyaltyEnabled, gstin: outlet.gstin },
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    items: itemRows.map((i) => ({
      id: i.id, name: i.name, categoryId: i.categoryId, price: ov.get(i.id)?.price ?? i.price, taxPct: Number(i.taxPct), isVeg: i.isVeg,
      best: i.isBestseller, desc: i.description, available: ov.get(i.id)?.available ?? true,
      groups: links.filter((l) => l.itemId === i.id).map((l) => groupMap.get(l.groupId)!).filter(Boolean),
    })),
    tables: tables.map((t) => ({ id: t.id, name: t.name, section: t.section, capacity: t.capacity, order: open.find((o) => o.tableId === t.id) ? { id: open.find((o) => o.tableId === t.id)!.id, orderNo: open.find((o) => o.tableId === t.id)!.orderNo, total: open.find((o) => o.tableId === t.id)!.total, status: open.find((o) => o.tableId === t.id)!.status, createdAt: open.find((o) => o.tableId === t.id)!.createdAt.toISOString() } : null })),
    openOrders: open.filter((o) => !o.tableId).map((o) => ({ id: o.id, orderNo: o.orderNo, type: o.type, status: o.status, total: o.total, customerName: o.customerName, createdAt: o.createdAt.toISOString() })),
  };

  return <PosClient data={data} initialOrderId={sp.order ? Number(sp.order) : null} canOverride={isManagerUp(user.role)} />;
}
