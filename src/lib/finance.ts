import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Cash that should be in the drawer: opening + cash sales (net of refunds) − cash expenses since the shift opened. */
export async function expectedCash(outletId: number, openedAt: Date, openingCash: number) {
  const db = await getDb();
  const [p] = await db.select({ v: sql<number>`COALESCE(SUM(${schema.payments.amount}), 0)::bigint` }).from(schema.payments)
    .where(and(eq(schema.payments.outletId, outletId), eq(schema.payments.method, "cash"), sql`${schema.payments.createdAt} >= ${openedAt}`));
  const [e] = await db.select({ v: sql<number>`COALESCE(SUM(${schema.expenses.amount}), 0)::bigint` }).from(schema.expenses)
    .where(and(eq(schema.expenses.outletId, outletId), eq(schema.expenses.method, "cash"), sql`${schema.expenses.createdAt} >= ${openedAt}`));
  return { cashIn: Number(p.v), cashOut: Number(e.v), expected: openingCash + Number(p.v) - Number(e.v) };
}
