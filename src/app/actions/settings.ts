"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
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

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

const outletSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(2, "Outlet name is required").max(80),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, "Code: 2–8 letters/numbers"),
  address: z.string().max(300), phone: z.string().max(20),
  gstin: z.string().trim().toUpperCase().regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/, "GSTIN format looks wrong"),
  fssai: z.string().max(20),
  upiId: z.string().max(60).regex(/^$|^[\w.\-]{2,}@[\w]{2,}$/, "UPI ID looks like name@bank"),
  isFranchise: z.boolean(), franchiseeName: z.string().max(80), royaltyPct: z.number().min(0).max(50),
  openTime: hhmm, closeTime: hhmm,
  deliveryRadiusKm: z.number().int().min(0).max(50), deliveryFeeNear: z.number().int().min(0), deliveryFeeFar: z.number().int().min(0),
  billFooter: z.string().max(200), taxInclusive: z.boolean(), gstOn: z.boolean(), loyaltyEnabled: z.boolean(), loyaltyEarnPct: z.number().int().min(0).max(50), active: z.boolean(),
});

export async function saveOutletAction(input: z.input<typeof outletSchema>) {
  return run(async () => {
    const { user } = await requireUser("settings");
    const v = outletSchema.parse(input);
    const head = isHeadOffice(user.role);
    const db = await getDb();
    const { id, royaltyPct, ...rest } = v;
    if (id) {
      // Franchisees/managers may edit their own outlet's operational settings but not commercial terms.
      const own = user.outletId === id;
      if (!head && !own) throw new Error("Not allowed");
      const [cur] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, id));
      if (!cur) throw new Error("Outlet not found");
      const vals = head ? { ...rest, royaltyPct: String(royaltyPct) } : { ...rest, code: cur.code, isFranchise: cur.isFranchise, franchiseeName: cur.franchiseeName, royaltyPct: cur.royaltyPct, active: cur.active };
      await db.update(schema.outlets).set(vals).where(eq(schema.outlets.id, id));
    } else {
      if (!head) throw new Error("Only head office can add outlets");
      const [row] = await db.insert(schema.outlets).values({ ...rest, royaltyPct: String(royaltyPct) }).returning({ id: schema.outlets.id });
      await db.insert(schema.diningTables).values(Array.from({ length: 4 }, (_, i) => ({ outletId: row.id, name: `T${i + 1}`, section: "Dining", capacity: 4 })));
      const ings = await db.select({ id: schema.ingredients.id, c: schema.ingredients.defaultCost }).from(schema.ingredients);
      if (ings.length) await db.insert(schema.stock).values(ings.map((i) => ({ outletId: row.id, ingredientId: i.id, qty: "0", minQty: "0", avgCost: i.c })));
    }
    await writeAudit(user.id, id ?? null, id ? "edit_outlet" : "add_outlet", "outlet", id ?? "", v.name);
    revalidatePath("/settings"); revalidatePath("/franchise");
    return {};
  });
}

export async function addTableAction(name: string, section: string, capacity: number) {
  return run(async () => {
    const { user } = await requireUser("settings");
    const outletId = await currentOutletId(user);
    const v = z.object({ name: z.string().trim().min(1).max(10), section: z.string().trim().min(1).max(30), capacity: z.number().int().min(1).max(30) }).parse({ name, section, capacity });
    const db = await getDb();
    await db.insert(schema.diningTables).values({ outletId, ...v });
    revalidatePath("/settings");
    return {};
  });
}

export async function toggleTableAction(id: number, active: boolean) {
  return run(async () => {
    const { user } = await requireUser("settings");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    await db.update(schema.diningTables).set({ active }).where(and(eq(schema.diningTables.id, id), eq(schema.diningTables.outletId, outletId)));
    revalidatePath("/settings");
    return {};
  });
}

export async function updateLeadAction(id: number, patch: { status?: "new" | "contacted" | "meeting" | "agreement" | "won" | "lost"; notes?: string }) {
  return run(async () => {
    const { user } = await requireUser("franchise");
    const v = z.object({ status: z.enum(["new", "contacted", "meeting", "agreement", "won", "lost"]).optional(), notes: z.string().max(1000).optional() }).parse(patch);
    const db = await getDb();
    await db.update(schema.franchiseLeads).set(v).where(eq(schema.franchiseLeads.id, id));
    await writeAudit(user.id, null, "lead_update", "lead", id, JSON.stringify(v).slice(0, 120));
    revalidatePath("/franchise");
    return {};
  });
}

export async function addLeadAction(input: { name: string; phone: string; city: string; budget: string; message: string }) {
  return run(async () => {
    await requireUser("franchise");
    const v = z.object({ name: z.string().trim().min(2).max(80), phone: z.string().transform((s) => s.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10, "10-digit mobile")), city: z.string().max(60), budget: z.string().max(40), message: z.string().max(500) }).parse(input);
    const db = await getDb();
    await db.insert(schema.franchiseLeads).values(v);
    revalidatePath("/franchise");
    return {};
  });
}
