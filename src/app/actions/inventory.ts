"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser, writeAudit } from "@/lib/auth";
import { isHeadOffice, isManagerUp } from "@/lib/permissions";
import type { Result } from "./pos";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

async function manager() {
  const { user } = await requireUser("inventory");
  if (!isManagerUp(user.role)) throw new Error("Only managers can do this");
  return { user, outletId: await currentOutletId(user) };
}

export async function addIngredientAction(input: { name: string; unit: "kg" | "g" | "l" | "ml" | "pcs"; category: string; costRupees: number; minQty: number; openingQty: number }) {
  return run(async () => {
    const { user, outletId } = await manager();
    const v = z.object({ name: z.string().trim().min(2).max(60), unit: z.enum(["kg", "g", "l", "ml", "pcs"]), category: z.string().trim().max(40), costRupees: z.number().min(0), minQty: z.number().min(0), openingQty: z.number().min(0) }).parse(input);
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [ing] = await tx.insert(schema.ingredients).values({ name: v.name, unit: v.unit, category: v.category || "General", defaultCost: Math.round(v.costRupees * 100) }).returning({ id: schema.ingredients.id });
      const outs = await tx.select({ id: schema.outlets.id }).from(schema.outlets);
      await tx.insert(schema.stock).values(outs.map((o) => ({ outletId: o.id, ingredientId: ing.id, qty: o.id === outletId ? String(v.openingQty) : "0", minQty: String(v.minQty), avgCost: Math.round(v.costRupees * 100) })));
    });
    await writeAudit(user.id, outletId, "add_ingredient", "ingredient", "", v.name);
    revalidatePath("/inventory");
    return {};
  });
}

export async function setMinStockAction(ingredientId: number, minQty: number) {
  return run(async () => {
    const { outletId } = await manager();
    const db = await getDb();
    await db.update(schema.stock).set({ minQty: String(Math.max(0, minQty)) }).where(and(eq(schema.stock.outletId, outletId), eq(schema.stock.ingredientId, ingredientId)));
    revalidatePath("/inventory");
    return {};
  });
}

/** wastage (subtract), production (add — e.g. today's fresh masala batch), count (set to the counted quantity). */
export async function stockMoveAction(input: { ingredientId: number; kind: "wastage" | "production" | "count"; qty: number; note: string }) {
  return run(async () => {
    const { user } = await requireUser("inventory");
    const outletId = await currentOutletId(user);
    const v = z.object({ ingredientId: z.number().int(), kind: z.enum(["wastage", "production", "count"]), qty: z.number().min(0).max(1000000), note: z.string().max(160) }).parse(input);
    if (v.kind === "count" && !isManagerUp(user.role)) throw new Error("Only managers can correct stock counts");
    if (v.kind === "wastage" && !v.note.trim()) throw new Error("Say what was wasted and why");
    const db = await getDb();
    await db.transaction(async (tx) => {
      const [s] = await tx.select().from(schema.stock).where(and(eq(schema.stock.outletId, outletId), eq(schema.stock.ingredientId, v.ingredientId)));
      if (!s) throw new Error("Ingredient not stocked at this outlet");
      const delta = v.kind === "wastage" ? -v.qty : v.kind === "production" ? v.qty : v.qty - Number(s.qty);
      if (delta === 0) return;
      await tx.update(schema.stock).set({ qty: sql`${schema.stock.qty} + ${delta}` }).where(and(eq(schema.stock.outletId, outletId), eq(schema.stock.ingredientId, v.ingredientId)));
      await tx.insert(schema.stockMovements).values({ outletId, ingredientId: v.ingredientId, kind: v.kind === "count" ? "adjustment" : v.kind, qty: String(delta), unitCost: s.avgCost, note: v.note, userId: user.id });
    });
    revalidatePath("/inventory");
    return {};
  });
}

const purchaseSchema = z.object({
  supplierId: z.number().int().nullable(),
  invoiceNo: z.string().max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidRupees: z.number().min(0),
  note: z.string().max(200).default(""),
  lines: z.array(z.object({ ingredientId: z.number().int(), qty: z.number().positive().max(1000000), unitCostRupees: z.number().min(0).max(1000000) })).min(1, "Add at least one item"),
});

/** Records a purchase, raises stock and updates the weighted-average cost of each ingredient. */
export async function createPurchaseAction(input: z.input<typeof purchaseSchema>) {
  return run(async () => {
    const { user, outletId } = await manager();
    const v = purchaseSchema.parse(input);
    const db = await getDb();
    const total = v.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCostRupees * 100), 0);
    await db.transaction(async (tx) => {
      const [p] = await tx.insert(schema.purchases).values({ outletId, supplierId: v.supplierId, invoiceNo: v.invoiceNo, total, paid: Math.round(v.paidRupees * 100), note: v.note, userId: user.id, purchaseDate: v.date }).returning({ id: schema.purchases.id });
      for (const l of v.lines) {
        const unitCost = Math.round(l.unitCostRupees * 100);
        await tx.insert(schema.purchaseItems).values({ purchaseId: p.id, ingredientId: l.ingredientId, qty: String(l.qty), unitCost });
        const [s] = await tx.select().from(schema.stock).where(and(eq(schema.stock.outletId, outletId), eq(schema.stock.ingredientId, l.ingredientId)));
        const onHand = Math.max(Number(s?.qty ?? 0), 0);
        const newAvg = onHand + l.qty > 0 ? Math.round((onHand * (s?.avgCost ?? unitCost) + l.qty * unitCost) / (onHand + l.qty)) : unitCost;
        await tx.update(schema.stock).set({ qty: sql`${schema.stock.qty} + ${l.qty}`, avgCost: newAvg }).where(and(eq(schema.stock.outletId, outletId), eq(schema.stock.ingredientId, l.ingredientId)));
        await tx.insert(schema.stockMovements).values({ outletId, ingredientId: l.ingredientId, kind: "purchase", qty: String(l.qty), unitCost, refId: p.id, userId: user.id });
      }
    });
    await writeAudit(user.id, outletId, "purchase", "purchase", "", `₹${total / 100}`);
    revalidatePath("/inventory");
    return { total };
  });
}

export async function saveRecipeAction(itemId: number, lines: { ingredientId: number; qty: number }[]) {
  return run(async () => {
    const { user } = await requireUser("inventory");
    if (!isHeadOffice(user.role) && user.role !== "manager") throw new Error("Only managers and head office can edit recipes");
    const clean = z.array(z.object({ ingredientId: z.number().int(), qty: z.number().positive().max(100000) })).parse(lines);
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.delete(schema.recipes).where(eq(schema.recipes.itemId, itemId));
      if (clean.length) await tx.insert(schema.recipes).values(clean.map((l) => ({ itemId, ingredientId: l.ingredientId, qty: String(l.qty) })));
    });
    revalidatePath("/inventory"); revalidatePath("/menu");
    return {};
  });
}

export async function addSupplierAction(input: { name: string; phone: string }) {
  return run(async () => {
    await manager();
    const v = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().max(20) }).parse(input);
    const db = await getDb();
    await db.insert(schema.suppliers).values(v);
    revalidatePath("/inventory");
    return {};
  });
}
