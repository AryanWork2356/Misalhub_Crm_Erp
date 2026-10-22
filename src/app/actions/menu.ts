"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser, writeAudit } from "@/lib/auth";
import { isHeadOffice } from "@/lib/permissions";
import type { Result } from "./pos";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

async function masterMenuUser() {
  const { user } = await requireUser("menu");
  if (!isHeadOffice(user.role)) throw new Error("Only head office can change the master menu. You can still mark items sold-out or set an outlet price.");
  return user;
}

const itemSchema = z.object({
  id: z.number().int().optional(),
  categoryId: z.number().int(),
  name: z.string().trim().min(2, "Name is required").max(80),
  description: z.string().max(300).default(""),
  price: z.number().int().min(0).max(10000000),
  taxPct: z.number().min(0).max(28),
  isVeg: z.boolean(),
  isBestseller: z.boolean(),
  jainAvailable: z.boolean(),
  spiceLevels: z.boolean(),
  prepMinutes: z.number().int().min(1).max(120),
  station: z.enum(["main", "bar"]),
  active: z.boolean(),
  groupIds: z.array(z.number().int()),
});

export async function saveItemAction(input: z.input<typeof itemSchema>) {
  return run(async () => {
    const user = await masterMenuUser();
    const v = itemSchema.parse(input);
    const db = await getDb();
    const { id, groupIds, taxPct, ...rest } = v;
    const values = { ...rest, taxPct: String(taxPct) };
    let itemId = id;
    await db.transaction(async (tx) => {
      if (id) await tx.update(schema.items).set(values).where(eq(schema.items.id, id));
      else {
        const [{ n }] = await tx.select({ n: sql<number>`COUNT(*)::int` }).from(schema.items);
        const [row] = await tx.insert(schema.items).values({ ...values, code: `MH${String(n + 1).padStart(3, "0")}${Math.floor(Math.random() * 90 + 10)}` }).returning({ id: schema.items.id });
        itemId = row.id;
      }
      await tx.delete(schema.itemModifierGroups).where(eq(schema.itemModifierGroups.itemId, itemId!));
      if (groupIds.length) await tx.insert(schema.itemModifierGroups).values(groupIds.map((g) => ({ itemId: itemId!, groupId: g })));
    });
    await writeAudit(user.id, null, id ? "edit_item" : "add_item", "item", itemId!, `${v.name} ₹${v.price / 100}`);
    revalidatePath("/menu");
    return { id: itemId! };
  });
}

export async function saveCategoryAction(input: { id?: number; name: string; sortOrder?: number; active?: boolean }) {
  return run(async () => {
    await masterMenuUser();
    const name = z.string().trim().min(2).max(50).parse(input.name);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const db = await getDb();
    if (input.id) await db.update(schema.categories).set({ name, slug, sortOrder: input.sortOrder ?? 0, active: input.active ?? true }).where(eq(schema.categories.id, input.id));
    else await db.insert(schema.categories).values({ name, slug, sortOrder: input.sortOrder ?? 99 });
    revalidatePath("/menu");
    return {};
  });
}

/** Outlet-level control: sold-out toggle and optional local price. Allowed for managers/franchisees on their own outlet. */
export async function setOutletItemAction(input: { itemId: number; available?: boolean; price?: number | null }) {
  return run(async () => {
    const { user } = await requireUser("menu");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [cur] = await db.select().from(schema.outletItems).where(and(eq(schema.outletItems.outletId, outletId), eq(schema.outletItems.itemId, input.itemId)));
    const available = input.available ?? cur?.available ?? true;
    const price = input.price === undefined ? cur?.price ?? null : input.price;
    if (price != null && (price < 0 || price > 10000000)) throw new Error("Invalid price");
    await db.insert(schema.outletItems).values({ outletId, itemId: input.itemId, available, price }).onConflictDoUpdate({ target: [schema.outletItems.outletId, schema.outletItems.itemId], set: { available, price } });
    if (input.price !== undefined) await writeAudit(user.id, outletId, "outlet_price", "item", input.itemId, String(price));
    revalidatePath("/menu"); revalidatePath("/pos");
    return {};
  });
}

export async function saveModifierGroupAction(input: { id?: number; name: string; minSelect: number; maxSelect: number }) {
  return run(async () => {
    await masterMenuUser();
    const v = z.object({ name: z.string().trim().min(2).max(40), minSelect: z.number().int().min(0).max(10), maxSelect: z.number().int().min(1).max(20) }).parse(input);
    const db = await getDb();
    if (input.id) await db.update(schema.modifierGroups).set(v).where(eq(schema.modifierGroups.id, input.id));
    else await db.insert(schema.modifierGroups).values(v);
    revalidatePath("/menu");
    return {};
  });
}

export async function saveModifierAction(input: { id?: number; groupId: number; name: string; price: number; isDefault?: boolean }) {
  return run(async () => {
    await masterMenuUser();
    const v = z.object({ groupId: z.number().int(), name: z.string().trim().min(1).max(50), price: z.number().int().min(0).max(1000000), isDefault: z.boolean().optional() }).parse(input);
    const db = await getDb();
    if (input.id) await db.update(schema.modifiers).set(v).where(eq(schema.modifiers.id, input.id));
    else await db.insert(schema.modifiers).values(v);
    revalidatePath("/menu");
    return {};
  });
}

export async function deleteModifierAction(id: number) {
  return run(async () => {
    await masterMenuUser();
    const db = await getDb();
    await db.delete(schema.modifiers).where(eq(schema.modifiers.id, id));
    revalidatePath("/menu");
    return {};
  });
}
