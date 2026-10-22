import "server-only";
import { and, between, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeTotals } from "./pricing";

const { orders, orderItems, payments, expenses } = schema;

export type Scope = { outletIds: number[]; from: string; to: string };

const rowsOf = <T,>(r: { rows: unknown[] }) => r.rows as T[];
const ids = (v: number[]) => sql.join(v.map((x) => sql`${x}`), sql`, `);

/** Sales = every order that wasn't cancelled/refunded, on its business date. */
const live = (s: Scope) => and(inArray(orders.outletId, s.outletIds), between(orders.businessDate, s.from, s.to), ne(orders.status, "cancelled"));

export async function summary(s: Scope) {
  const db = await getDb();
  const [r] = await db.select({
    sales: sql<number>`COALESCE(SUM(${orders.total}), 0)::bigint`, count: sql<number>`COUNT(*)::int`,
    discount: sql<number>`COALESCE(SUM(${orders.discount}), 0)::bigint`, tax: sql<number>`COALESCE(SUM(${orders.tax}), 0)::bigint`,
    delivery: sql<number>`COALESCE(SUM(${orders.deliveryFee}), 0)::bigint`, covers: sql<number>`COALESCE(SUM(${orders.covers}), 0)::int`,
    unpaid: sql<number>`COALESCE(SUM(${orders.total} - ${orders.paid}) FILTER (WHERE ${orders.paymentStatus} <> 'paid'), 0)::bigint`,
  }).from(orders).where(live(s));
  const [c] = await db.select({ n: sql<number>`COUNT(*)::int`, v: sql<number>`COALESCE(SUM(${orders.total}), 0)::bigint` }).from(orders)
    .where(and(inArray(orders.outletId, s.outletIds), between(orders.businessDate, s.from, s.to), eq(orders.status, "cancelled")));
  const sales = Number(r.sales);
  return { sales, orders: r.count, avgOrder: r.count ? Math.round(sales / r.count) : 0, discount: Number(r.discount), tax: Number(r.tax), delivery: Number(r.delivery), covers: r.covers, unpaid: Number(r.unpaid), cancelled: c.n, cancelledValue: Number(c.v) };
}

export async function dailySeries(s: Scope) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT business_date::text AS d, SUM(total)::bigint AS sales, COUNT(*)::int AS orders FROM orders
    WHERE outlet_id IN (${ids(s.outletIds)}) AND business_date BETWEEN ${s.from} AND ${s.to} AND status <> 'cancelled' GROUP BY 1 ORDER BY 1`);
  return rowsOf<{ d: string; sales: string; orders: number }>(r).map((x) => ({ d: x.d, sales: Number(x.sales), orders: x.orders }));
}

export async function hourlySeries(s: Scope) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS h, SUM(total)::bigint AS sales, COUNT(*)::int AS orders FROM orders
    WHERE outlet_id IN (${ids(s.outletIds)}) AND business_date BETWEEN ${s.from} AND ${s.to} AND status <> 'cancelled' GROUP BY 1 ORDER BY 1`);
  const map = new Map(rowsOf<{ h: number; sales: string; orders: number }>(r).map((x) => [x.h, x]));
  // always show the normal trading window, plus any off-hours that actually had orders
  const hours = [...new Set([...Array.from({ length: 14 }, (_, i) => i + 7), ...map.keys()])].sort((a, b) => a - b);
  return hours.map((h) => ({ h, label: `${h % 12 || 12}${h < 12 ? "a" : "p"}`, sales: Number(map.get(h)?.sales ?? 0), orders: map.get(h)?.orders ?? 0 }));
}

/** weekday (0=Sun) × hour heat map of order counts */
export async function weekdayHour(s: Scope) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT EXTRACT(DOW FROM business_date)::int AS dow, EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS h, COUNT(*)::int AS n FROM orders
    WHERE outlet_id IN (${ids(s.outletIds)}) AND business_date BETWEEN ${s.from} AND ${s.to} AND status <> 'cancelled' GROUP BY 1, 2`);
  return rowsOf<{ dow: number; h: number; n: number }>(r);
}

export async function topItems(s: Scope, limit = 10) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT oi.item_id AS id, oi.name, c.name AS category, SUM(oi.qty)::int AS qty, SUM(oi.line_total)::bigint AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN items i ON i.id = oi.item_id JOIN categories c ON c.id = i.category_id
    WHERE o.outlet_id IN (${ids(s.outletIds)}) AND o.business_date BETWEEN ${s.from} AND ${s.to} AND o.status <> 'cancelled' AND oi.status <> 'cancelled'
    GROUP BY oi.item_id, oi.name, c.name ORDER BY revenue DESC LIMIT ${limit}`);
  return rowsOf<{ id: number; name: string; category: string; qty: number; revenue: string }>(r).map((x) => ({ ...x, revenue: Number(x.revenue) }));
}

export async function allItemsSold(s: Scope) {
  return topItems(s, 500);
}

export async function categorySales(s: Scope) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT c.name, SUM(oi.qty)::int AS qty, SUM(oi.line_total)::bigint AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN items i ON i.id = oi.item_id JOIN categories c ON c.id = i.category_id
    WHERE o.outlet_id IN (${ids(s.outletIds)}) AND o.business_date BETWEEN ${s.from} AND ${s.to} AND o.status <> 'cancelled' AND oi.status <> 'cancelled'
    GROUP BY c.name ORDER BY revenue DESC`);
  return rowsOf<{ name: string; qty: number; revenue: string }>(r).map((x) => ({ ...x, revenue: Number(x.revenue) }));
}

export async function splitBy(s: Scope, col: "type" | "channel") {
  const db = await getDb();
  const column = col === "type" ? orders.type : orders.channel;
  const r = await db.select({ k: column, n: sql<number>`COUNT(*)::int`, v: sql<number>`COALESCE(SUM(${orders.total}), 0)::bigint` }).from(orders).where(live(s)).groupBy(column).orderBy(sql`2 DESC`);
  return r.map((x) => ({ k: String(x.k), n: x.n, v: Number(x.v) }));
}

export async function paymentSplit(s: Scope) {
  const db = await getDb();
  const r = await db.select({ k: payments.method, v: sql<number>`COALESCE(SUM(${payments.amount}), 0)::bigint`, n: sql<number>`COUNT(*)::int` }).from(payments)
    .where(and(inArray(payments.outletId, s.outletIds), between(payments.businessDate, s.from, s.to))).groupBy(payments.method);
  return r.map((x) => ({ k: String(x.k), v: Number(x.v), n: x.n })).sort((a, b) => b.v - a.v);
}

/** Per-rate GST: recomputed from lines so inclusive/exclusive outlets both report correctly. */
export async function gstReport(s: Scope) {
  const db = await getDb();
  const os = await db.select().from(orders).where(live(s));
  if (!os.length) return { rows: [] as { rate: number; taxable: number; cgst: number; sgst: number }[], total: 0 };
  const outs = await db.select().from(schema.outlets).where(inArray(schema.outlets.id, s.outletIds));
  const lines = await db.select().from(orderItems).where(and(inArray(orderItems.orderId, os.map((o) => o.id)), ne(orderItems.status, "cancelled")));
  const byOrder = new Map<number, typeof lines>();
  for (const l of lines) byOrder.set(l.orderId, [...(byOrder.get(l.orderId) ?? []), l]);
  const acc = new Map<number, { taxable: number; tax: number }>();
  for (const o of os) {
    const outlet = outs.find((x) => x.id === o.outletId)!;
    const t = computeTotals({ lines: byOrder.get(o.id) ?? [], discount: o.discount, taxInclusive: outlet.taxInclusive, gstOn: outlet.gstOn });
    for (const b of t.taxBreakup) { const a = acc.get(b.rate) ?? { taxable: 0, tax: 0 }; a.taxable += b.taxable; a.tax += b.tax; acc.set(b.rate, a); }
  }
  const rows = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, taxable: v.taxable, cgst: Math.round(v.tax / 2), sgst: v.tax - Math.round(v.tax / 2) }));
  return { rows, total: rows.reduce((s2, r) => s2 + r.cgst + r.sgst, 0) };
}

/** Food cost per item from recipes × current average ingredient cost. */
export async function recipeCosts(outletIds: number[]) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT r.item_id AS id, SUM(r.qty * COALESCE(sc.avg_cost, ing.default_cost))::float AS cost
    FROM recipes r JOIN ingredients ing ON ing.id = r.ingredient_id
    LEFT JOIN (SELECT ingredient_id, AVG(avg_cost) AS avg_cost FROM stock WHERE outlet_id IN (${ids(outletIds)}) GROUP BY ingredient_id) sc ON sc.ingredient_id = r.ingredient_id
    GROUP BY r.item_id`);
  return new Map(rowsOf<{ id: number; cost: number }>(r).map((x) => [x.id, Math.round(x.cost)]));
}

export async function expenseTotals(s: Scope) {
  const db = await getDb();
  const r = await db.select({ category: expenses.category, v: sql<number>`COALESCE(SUM(${expenses.amount}), 0)::bigint` }).from(expenses)
    .where(and(inArray(expenses.outletId, s.outletIds), between(expenses.expenseDate, s.from, s.to))).groupBy(expenses.category).orderBy(sql`2 DESC`);
  return r.map((x) => ({ category: x.category, v: Number(x.v) }));
}

export async function profitAndLoss(s: Scope) {
  const sm = await summary(s);
  const exp = await expenseTotals(s);
  const sold = await allItemsSold(s);
  const costs = await recipeCosts(s.outletIds);
  const cogs = sold.reduce((sum, i) => sum + (costs.get(i.id) ?? 0) * i.qty, 0);
  const totalItemRevenue = sold.reduce((sum, i) => sum + i.revenue, 0);
  /** share of item revenue that has a recipe — food cost is only meaningful when this is high */
  const recipeCoverage = totalItemRevenue ? sold.filter((i) => costs.has(i.id)).reduce((sum, i) => sum + i.revenue, 0) / totalItemRevenue : 0;
  const expensesTotal = exp.reduce((a, b) => a + b.v, 0);
  // Raw-material spending is already represented by the recipe-based food cost, so it must not be subtracted twice.
  const rawPurchases = exp.find((e) => e.category === "Raw material")?.v ?? 0;
  const opex = expensesTotal - rawPurchases;
  const netSales = sm.sales - sm.tax;
  const gross = netSales - cogs;
  return { ...sm, netSales, cogs, gross, recipeCoverage, expenses: expensesTotal, rawPurchases, opex, expenseRows: exp, net: gross - opex, cashProfit: netSales - expensesTotal };
}

export async function lowStock(outletId: number) {
  const db = await getDb();
  const r = await db.execute(sql`SELECT i.id, i.name, i.unit, s.qty::float AS qty, s.min_qty::float AS min FROM stock s JOIN ingredients i ON i.id = s.ingredient_id
    WHERE s.outlet_id = ${outletId} AND s.qty <= s.min_qty AND i.active ORDER BY (s.qty / NULLIF(s.min_qty, 0)) ASC NULLS LAST`);
  return rowsOf<{ id: number; name: string; unit: string; qty: number; min: number }>(r);
}

export async function outletComparison(from: string, to: string) {
  const db = await getDb();
  const outs = await db.select().from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id);
  const out = [];
  for (const o of outs) {
    const s = { outletIds: [o.id], from, to };
    const sm = await summary(s);
    const exp = (await expenseTotals(s)).reduce((a, b) => a + b.v, 0);
    out.push({ outlet: o, ...sm, expenses: exp, royalty: o.isFranchise ? Math.round((sm.sales - sm.tax) * Number(o.royaltyPct) / 100) : 0 });
  }
  return out;
}
