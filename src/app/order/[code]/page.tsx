import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import OrderClient, { type PublicMenu } from "./order-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Order online · ${code.toUpperCase()}` };
}

export default async function PublicOrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ table?: string }> }) {
  const { code } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [outlet] = await db.select().from(schema.outlets).where(and(eq(schema.outlets.code, code.toUpperCase()), eq(schema.outlets.active, true)));
  if (!outlet) notFound();
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.active, true)).orderBy(asc(schema.categories.sortOrder));
  const items = await db.select().from(schema.items).where(eq(schema.items.active, true)).orderBy(asc(schema.items.sortOrder));
  const ov = await db.select().from(schema.outletItems).where(eq(schema.outletItems.outletId, outlet.id));
  const links = await db.select().from(schema.itemModifierGroups);
  const groups = await db.select().from(schema.modifierGroups);
  const mods = await db.select().from(schema.modifiers);

  let table: string | null = null;
  if (sp.table) {
    const [t] = await db.select().from(schema.diningTables).where(and(eq(schema.diningTables.outletId, outlet.id), eq(schema.diningTables.name, sp.table), eq(schema.diningTables.active, true)));
    table = t?.name ?? null;
  }

  const menu: PublicMenu = {
    outlet: { code: outlet.code, name: outlet.name, address: outlet.address, phone: outlet.phone, open: outlet.openTime, close: outlet.closeTime, feeNear: outlet.deliveryFeeNear, feeFar: outlet.deliveryFeeFar, radius: outlet.deliveryRadiusKm },
    table,
    categories: cats.map((c) => ({
      id: c.id, name: c.name,
      items: items.filter((i) => i.categoryId === c.id && (ov.find((o) => o.itemId === i.id)?.available ?? true) && i.name !== "Extras").map((i) => ({
        id: i.id, name: i.name, description: i.description, price: ov.find((o) => o.itemId === i.id)?.price ?? i.price, best: i.isBestseller,
        groups: links.filter((l) => l.itemId === i.id).map((l) => groups.find((g) => g.id === l.groupId)!).filter(Boolean).map((g) => ({ id: g.id, name: g.name, min: g.minSelect, max: g.maxSelect, mods: mods.filter((m) => m.groupId === g.id).map((m) => ({ id: m.id, name: m.name, price: m.price, isDefault: m.isDefault })) })),
      })),
    })).filter((c) => c.items.length > 0),
  };
  return <OrderClient menu={menu} />;
}
