import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { addDays, businessDate } from "./dates";
import { fmt } from "./money";
import { dailySeries, profitAndLoss, recipeCosts, summary, topItems, type Scope } from "./reports";

const rows = <T,>(r: { rows: unknown[] }) => r.rows as T[];

/** Tomorrow's expected units per item (same-weekday average over the last 4 weeks) turned into ingredient quantities. */
export async function prepPlan(outletId: number) {
  const db = await getDb();
  const today = businessDate();
  const target = addDays(today, 1);
  const dow = new Date(target + "T00:00:00Z").getUTCDay();
  const from = addDays(today, -28);

  const [{ n }] = rows<{ n: number }>(await db.execute(sql`SELECT COUNT(DISTINCT business_date)::int AS n FROM orders
    WHERE outlet_id = ${outletId} AND business_date BETWEEN ${from} AND ${today} AND status <> 'cancelled' AND EXTRACT(DOW FROM business_date) = ${dow} AND business_date < ${today}`));
  if (!n) return { target, dow, days: 0, items: [], ingredients: [] };

  const items = rows<{ id: number; name: string; qty: number }>(await db.execute(sql`SELECT oi.item_id AS id, oi.name, (SUM(oi.qty)::float / ${n}) AS qty
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.outlet_id = ${outletId} AND o.business_date BETWEEN ${from} AND ${today} AND o.business_date < ${today} AND o.status <> 'cancelled' AND oi.status <> 'cancelled'
      AND EXTRACT(DOW FROM o.business_date) = ${dow}
    GROUP BY oi.item_id, oi.name ORDER BY qty DESC`));

  const ing = rows<{ id: number; name: string; unit: string; need: number; have: number; min: number }>(await db.execute(sql`
    WITH fc AS (
      SELECT oi.item_id, (SUM(oi.qty)::float / ${n}) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.outlet_id = ${outletId} AND o.business_date BETWEEN ${from} AND ${today} AND o.business_date < ${today} AND o.status <> 'cancelled' AND oi.status <> 'cancelled'
        AND EXTRACT(DOW FROM o.business_date) = ${dow} GROUP BY oi.item_id)
    SELECT i.id, i.name, i.unit, SUM(fc.qty * r.qty)::float AS need, s.qty::float AS have, s.min_qty::float AS min
    FROM fc JOIN recipes r ON r.item_id = fc.item_id JOIN ingredients i ON i.id = r.ingredient_id
    JOIN stock s ON s.ingredient_id = i.id AND s.outlet_id = ${outletId}
    GROUP BY i.id, i.name, i.unit, s.qty, s.min_qty ORDER BY need DESC`));
  return { target, dow, days: n, items: items.slice(0, 12).map((i) => ({ ...i, qty: Math.round(i.qty) })), ingredients: ing };
}

/** Days of stock left from the last 14 days of average consumption. */
export async function runOutForecast(outletId: number) {
  const db = await getDb();
  const r = rows<{ id: number; name: string; unit: string; qty: number; perDay: number }>(await db.execute(sql`
    SELECT i.id, i.name, i.unit, s.qty::float AS qty, (COALESCE(-SUM(m.qty) FILTER (WHERE m.kind = 'sale'), 0) / 14.0)::float AS "perDay"
    FROM stock s JOIN ingredients i ON i.id = s.ingredient_id
    LEFT JOIN stock_movements m ON m.ingredient_id = s.ingredient_id AND m.outlet_id = s.outlet_id AND m.created_at > now() - interval '14 days'
    WHERE s.outlet_id = ${outletId} AND i.active GROUP BY i.id, i.name, i.unit, s.qty`));
  return r.filter((x) => x.perDay > 0.0001).map((x) => ({ ...x, daysLeft: Math.max(x.qty, 0) / x.perDay })).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8);
}

/** Items most often ordered together (support = % of orders that contain both). */
export async function frequentPairs(s: Scope, limit = 8) {
  const db = await getDb();
  const ids = sql.join(s.outletIds.map((x) => sql`${x}`), sql`, `);
  const [{ total }] = rows<{ total: number }>(await db.execute(sql`SELECT COUNT(*)::int AS total FROM orders WHERE outlet_id IN (${ids}) AND business_date BETWEEN ${s.from} AND ${s.to} AND status <> 'cancelled'`));
  if (!total) return [];
  const r = rows<{ a: string; b: string; n: number }>(await db.execute(sql`
    SELECT x.name AS a, y.name AS b, COUNT(DISTINCT x.order_id)::int AS n
    FROM order_items x JOIN order_items y ON y.order_id = x.order_id AND x.item_id < y.item_id
    JOIN orders o ON o.id = x.order_id
    WHERE o.outlet_id IN (${ids}) AND o.business_date BETWEEN ${s.from} AND ${s.to} AND o.status <> 'cancelled' AND x.status <> 'cancelled' AND y.status <> 'cancelled'
    GROUP BY x.name, y.name HAVING COUNT(DISTINCT x.order_id) >= 5 ORDER BY n DESC LIMIT ${limit}`));
  return r.map((p) => ({ ...p, support: (p.n / total) * 100 }));
}

export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

/** Menu engineering: popularity (qty) vs. contribution margin per unit, split at the median. */
export async function menuEngineering(s: Scope) {
  const sold = await topItems(s, 200);
  const costs = await recipeCosts(s.outletIds);
  const rowsOut = sold.filter((i) => costs.has(i.id) && i.qty > 0).map((i) => ({ id: i.id, name: i.name, qty: i.qty, margin: Math.round(i.revenue / i.qty - costs.get(i.id)!) }));
  if (rowsOut.length < 4) return [];
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const qMed = med(rowsOut.map((r) => r.qty));
  const mMed = med(rowsOut.map((r) => r.margin));
  return rowsOut.map((r) => ({ ...r, cls: (r.qty >= qMed ? (r.margin >= mMed ? "star" : "plowhorse") : r.margin >= mMed ? "puzzle" : "dog") as MenuClass }));
}

export type Alert = { level: "good" | "warn" | "bad" | "info"; title: string; detail: string };

export async function alerts(outletId: number): Promise<Alert[]> {
  const db = await getDb();
  const today = businessDate();
  // compare two full weeks, excluding today's unfinished day
  const cur: Scope = { outletIds: [outletId], from: addDays(today, -7), to: addDays(today, -1) };
  const prev: Scope = { outletIds: [outletId], from: addDays(today, -14), to: addDays(today, -8) };
  const [c, p, pl, daily] = await Promise.all([summary(cur), summary(prev), profitAndLoss({ outletIds: [outletId], from: addDays(today, -29), to: today }), dailySeries({ outletIds: [outletId], from: addDays(today, -55), to: today })]);
  const out: Alert[] = [];

  if (p.sales > 0) {
    const g = ((c.sales - p.sales) / p.sales) * 100;
    out.push({ level: g >= 5 ? "good" : g <= -8 ? "bad" : "info", title: `Sales ${g >= 0 ? "up" : "down"} ${Math.abs(g).toFixed(0)}% vs last week`, detail: `${fmt(c.sales)} in the last 7 full days against ${fmt(p.sales)} the 7 days before.` });
  }
  const gross = c.sales + c.discount;
  if (gross > 0 && (c.discount / gross) * 100 > 8) out.push({ level: "warn", title: `Discounts are ${((c.discount / gross) * 100).toFixed(1)}% of sales`, detail: "Above the usual 5–8% band. Review who is giving manual discounts (Settings → Audit log) and whether coupons are being over-used." });
  const attempted = c.orders + c.cancelled;
  if (attempted > 20 && (c.cancelled / attempted) * 100 > 4) out.push({ level: "bad", title: `${((c.cancelled / attempted) * 100).toFixed(1)}% of orders were cancelled`, detail: `${c.cancelled} cancelled worth ${fmt(c.cancelledValue)} this week. Check the reasons in the audit log for patterns (wrong punches, kitchen delays, stock-outs).` });
  if (pl.netSales > 0 && pl.recipeCoverage < 0.7) {
    out.push({ level: "info", title: "Add recipes to unlock food-cost tracking", detail: `Only ${Math.round(pl.recipeCoverage * 100)}% of your sales are from items with a recipe, so food cost and margins would be understated. Add recipes in Inventory → Recipes.` });
  } else if (pl.netSales > 0) {
    const fc = (pl.cogs / pl.netSales) * 100;
    if (fc > 38) out.push({ level: "warn", title: `Food cost is ${fc.toFixed(0)}% of net sales`, detail: "Target for a misal shop is roughly 30–35%. Check ingredient prices in Inventory → Purchases and portion sizes for high-cost items." });
    else if (fc > 0) out.push({ level: "good", title: `Food cost healthy at ${fc.toFixed(0)}%`, detail: "Recipe-based cost is within the normal range." });
  }
  const [fb] = rows<{ avg: number; n: number }>(await db.execute(sql`SELECT COALESCE(AVG(rating),0)::float AS avg, COUNT(*)::int AS n FROM feedback WHERE outlet_id = ${outletId} AND created_at > now() - interval '30 days'`));
  if (fb.n >= 10 && fb.avg < 4) out.push({ level: "bad", title: `Guest rating slipped to ${fb.avg.toFixed(2)} ★`, detail: "Read recent comments in Marketing → Feedback and respond to low scores quickly." });
  else if (fb.n >= 10) out.push({ level: "good", title: `Guests rate you ${fb.avg.toFixed(2)} ★`, detail: `Across ${fb.n} reviews in the last 30 days.` });

  // best / worst weekday
  const byDow = new Map<number, number[]>();
  for (const d of daily) { const dow = new Date(d.d + "T00:00:00Z").getUTCDay(); byDow.set(dow, [...(byDow.get(dow) ?? []), d.sales]); }
  const avg = [...byDow.entries()].map(([dow, v]) => ({ dow, a: v.reduce((x, y) => x + y, 0) / v.length })).sort((x, y) => y.a - x.a);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (avg.length >= 5) out.push({ level: "info", title: `${names[avg[0].dow]} is your strongest day`, detail: `Averaging ${fmt(Math.round(avg[0].a))}, vs ${fmt(Math.round(avg[avg.length - 1].a))} on ${names[avg[avg.length - 1].dow]}. Staff and prep accordingly — a ${names[avg[avg.length - 1].dow]} offer could lift the slow day.` });

  const [lost] = rows<{ n: number }>(await db.execute(sql`SELECT COUNT(*)::int AS n FROM customers WHERE visits >= 3 AND last_visit_at < now() - interval '30 days' AND last_visit_at > now() - interval '90 days' AND marketing_opt_in`));
  if (lost.n > 0) out.push({ level: "warn", title: `${lost.n} regulars haven't visited in 30+ days`, detail: "Send a win-back WhatsApp from Marketing → WhatsApp campaigns — it takes about two minutes." });
  return out;
}
