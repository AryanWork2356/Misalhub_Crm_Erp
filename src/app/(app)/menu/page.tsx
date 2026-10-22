import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isHeadOffice } from "@/lib/permissions";
import { PageHeader, Tabs } from "@/components/ui";
import { costOfItems } from "./cost";
import MenuManager from "./menu-manager";
import ModifierManager from "./modifier-manager";

export const metadata = { title: "Menu" };
export const dynamic = "force-dynamic";

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireUser("menu");
  const outletId = await currentOutletId(user);
  const tab = (await searchParams).tab ?? "items";
  const db = await getDb();
  const cats = await db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder));
  const groups = await db.select().from(schema.modifierGroups).orderBy(asc(schema.modifierGroups.id));
  const mods = await db.select().from(schema.modifiers).orderBy(asc(schema.modifiers.id));

  const body = tab === "modifiers"
    ? <ModifierManager canEdit={isHeadOffice(user.role)} groups={groups.map((g) => ({ ...g, mods: mods.filter((m) => m.groupId === g.id) }))} />
    : await items(outletId, isHeadOffice(user.role), cats, groups);

  return (
    <div>
      <PageHeader title="Menu" subtitle={isHeadOffice(user.role) ? "Master menu for all outlets" : "Mark items sold-out or set your outlet price. Master menu is managed by head office."} />
      <Tabs base="/menu" current={tab} tabs={[{ id: "items", label: "Items" }, { id: "modifiers", label: "Modifiers & add-ons" }]} />
      {body}
    </div>
  );
}

async function items(outletId: number, canEdit: boolean, cats: (typeof schema.categories.$inferSelect)[], groups: (typeof schema.modifierGroups.$inferSelect)[]) {
  const db = await getDb();
  const rows = await db.select().from(schema.items).orderBy(asc(schema.items.categoryId), asc(schema.items.sortOrder));
  const ov = await db.select().from(schema.outletItems).where(eq(schema.outletItems.outletId, outletId));
  const links = await db.select().from(schema.itemModifierGroups);
  const costs = await costOfItems(outletId);
  return (
    <MenuManager canEdit={canEdit} categories={cats.map((c) => ({ id: c.id, name: c.name }))} groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      items={rows.map((i) => ({
        id: i.id, categoryId: i.categoryId, code: i.code, name: i.name, description: i.description, price: i.price, taxPct: Number(i.taxPct), isVeg: i.isVeg, isBestseller: i.isBestseller,
        jainAvailable: i.jainAvailable, spiceLevels: i.spiceLevels, prepMinutes: i.prepMinutes, station: i.station as "main" | "bar", active: i.active,
        outletPrice: ov.find((o) => o.itemId === i.id)?.price ?? null, available: ov.find((o) => o.itemId === i.id)?.available ?? true,
        groupIds: links.filter((l) => l.itemId === i.id).map((l) => l.groupId), cost: costs.get(i.id) ?? null,
      }))} />
  );
}
