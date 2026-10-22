"use server";

import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireUser, writeAudit } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import type { Result } from "./pos";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function saveCustomerAction(input: { id?: number; name: string; phone: string; email?: string; birthday?: string | null; address?: string; notes?: string; marketingOptIn?: boolean }) {
  return run(async () => {
    await requireUser("customers");
    const v = z.object({
      name: z.string().trim().max(80), phone: z.string().transform((s) => s.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10, "Enter a 10-digit mobile number")),
      email: z.string().email().or(z.literal("")).optional(), birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      address: z.string().max(300).optional(), notes: z.string().max(500).optional(), marketingOptIn: z.boolean().optional(),
    }).parse(input);
    const db = await getDb();
    const vals = { name: v.name, phone: v.phone, email: v.email || null, birthday: v.birthday || null, address: v.address ?? "", notes: v.notes ?? "", marketingOptIn: v.marketingOptIn ?? true };
    if (input.id) await db.update(schema.customers).set(vals).where(eq(schema.customers.id, input.id));
    else await db.insert(schema.customers).values(vals);
    revalidatePath("/customers");
    return {};
  });
}

export async function adjustPointsAction(customerId: number, points: number, note: string) {
  return run(async () => {
    const { user } = await requireUser("customers");
    if (!isManagerUp(user.role)) throw new Error("Only managers can adjust loyalty points");
    const p = z.number().int().min(-100000).max(100000).parse(points);
    if (!note.trim()) throw new Error("Give a reason");
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.update(schema.customers).set({ loyaltyPoints: sql`GREATEST(${schema.customers.loyaltyPoints} + ${p}, 0)` }).where(eq(schema.customers.id, customerId));
      await tx.insert(schema.loyaltyTxns).values({ customerId, points: p, kind: p >= 0 ? "bonus" : "adjust", note: note.trim() });
    });
    await writeAudit(user.id, null, "adjust_points", "customer", customerId, `${p} ${note}`);
    revalidatePath(`/customers/${customerId}`);
    return {};
  });
}

export async function saveCouponAction(input: { id?: number; code: string; description: string; kind: "percent" | "flat"; value: number; minOrder: number; maxDiscount: number | null; validTo: string | null; usageLimit: number | null; active: boolean }) {
  return run(async () => {
    const { user } = await requireUser("marketing");
    if (!isManagerUp(user.role)) throw new Error("Only managers can manage coupons");
    const v = z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Code: 3–20 letters/numbers"), description: z.string().max(120),
      kind: z.enum(["percent", "flat"]), value: z.number().int().min(1), minOrder: z.number().int().min(0), maxDiscount: z.number().int().min(0).nullable(),
      validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), usageLimit: z.number().int().min(1).nullable(), active: z.boolean(),
    }).refine((x) => x.kind !== "percent" || x.value <= 100, { message: "Percent can't exceed 100" }).parse(input);
    const db = await getDb();
    if (input.id) await db.update(schema.coupons).set(v).where(eq(schema.coupons.id, input.id));
    else await db.insert(schema.coupons).values(v);
    revalidatePath("/marketing");
    return {};
  });
}
