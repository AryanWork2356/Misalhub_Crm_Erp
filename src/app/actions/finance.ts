"use server";

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser, writeAudit } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { expectedCash } from "@/lib/finance";
import type { Result } from "./pos";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

export async function openShiftAction(openingRupees: number) {
  return run(async () => {
    const { user } = await requireUser("register");
    const outletId = await currentOutletId(user);
    const amount = z.number().min(0).max(10000000).parse(openingRupees);
    const db = await getDb();
    const [open] = await db.select().from(schema.registerShifts).where(and(eq(schema.registerShifts.outletId, outletId), isNull(schema.registerShifts.closedAt)));
    if (open) throw new Error("A shift is already open. Close it first.");
    await db.insert(schema.registerShifts).values({ outletId, openedBy: user.id, openingCash: Math.round(amount * 100) });
    revalidatePath("/register");
    return {};
  });
}

export async function closeShiftAction(closingRupees: number, notes: string) {
  return run(async () => {
    const { user } = await requireUser("register");
    const outletId = await currentOutletId(user);
    const counted = Math.round(z.number().min(0).max(100000000).parse(closingRupees) * 100);
    const db = await getDb();
    const [open] = await db.select().from(schema.registerShifts).where(and(eq(schema.registerShifts.outletId, outletId), isNull(schema.registerShifts.closedAt)));
    if (!open) throw new Error("No open shift");
    const { expected } = await expectedCash(outletId, open.openedAt, open.openingCash);
    await db.update(schema.registerShifts).set({ closedAt: new Date(), closedBy: user.id, closingCash: counted, expectedCash: expected, notes: notes.slice(0, 300) }).where(eq(schema.registerShifts.id, open.id));
    await writeAudit(user.id, outletId, "close_shift", "shift", open.id, `counted ${counted / 100}, expected ${expected / 100}`);
    revalidatePath("/register");
    return { variance: counted - expected };
  });
}

export async function addExpenseAction(input: { category: string; amountRupees: number; method: "cash" | "upi" | "bank" | "card"; note: string; date: string }) {
  return run(async () => {
    const { user } = await requireUser("expenses");
    const outletId = await currentOutletId(user);
    const v = z.object({ category: z.string().min(2).max(40), amountRupees: z.number().positive().max(10000000), method: z.enum(["cash", "upi", "bank", "card"]), note: z.string().max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input);
    const db = await getDb();
    await db.insert(schema.expenses).values({ outletId, category: v.category, amount: Math.round(v.amountRupees * 100), method: v.method, note: v.note, expenseDate: v.date, userId: user.id });
    revalidatePath("/expenses");
    return {};
  });
}

export async function deleteExpenseAction(id: number) {
  return run(async () => {
    const { user } = await requireUser("expenses");
    if (!isManagerUp(user.role)) throw new Error("Only managers can delete expenses");
    const outletId = await currentOutletId(user);
    const db = await getDb();
    const [e] = await db.select().from(schema.expenses).where(and(eq(schema.expenses.id, id), eq(schema.expenses.outletId, outletId)));
    if (!e) throw new Error("Expense not found");
    await db.delete(schema.expenses).where(eq(schema.expenses.id, id));
    await writeAudit(user.id, outletId, "delete_expense", "expense", id, `${e.category} ₹${e.amount / 100}`);
    revalidatePath("/expenses");
    return {};
  });
}
