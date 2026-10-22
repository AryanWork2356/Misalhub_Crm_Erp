import Link from "next/link";
import { and, eq, inArray, sql } from "drizzle-orm";
import { AlertTriangle, BellRing } from "lucide-react";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { addDays, businessDate, fmtDate } from "@/lib/dates";
import { fmt, fmtCompact } from "@/lib/money";
import { dailySeries, hourlySeries, lowStock, paymentSplit, splitBy, summary, topItems } from "@/lib/reports";
import { PageHeader, Stat, CHANNEL_LABEL, TYPE_LABEL } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts";
import { Delta, HBars } from "@/components/viz";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { user } = await requireUser("dashboard");
  const outletId = await currentOutletId(user);
  const db = await getDb();
  const today = businessDate();
  const t = { outletIds: [outletId], from: today, to: today };
  const y = { outletIds: [outletId], from: addDays(today, -1), to: addDays(today, -1) };
  const week = { outletIds: [outletId], from: addDays(today, -13), to: today };

  const [sum, ysum, hourly, daily, top, pay, types, channels, low] = await Promise.all([
    summary(t), summary(y), hourlySeries(t), dailySeries(week), topItems(t, 6), paymentSplit(t), splitBy(t, "type"), splitBy(t, "channel"), lowStock(outletId),
  ]);
  const open = await db.select({ n: sql<number>`COUNT(*)::int` }).from(schema.orders).where(and(eq(schema.orders.outletId, outletId), inArray(schema.orders.status, ["new", "preparing", "ready", "served", "out_for_delivery"])));
  const incoming = await db.select({ n: sql<number>`COUNT(*)::int` }).from(schema.orders).where(and(eq(schema.orders.outletId, outletId), eq(schema.orders.status, "new"), sql`channel <> 'pos'`, sql`NOT EXISTS (SELECT 1 FROM kots k WHERE k.order_id = orders.id)`));

  // fill missing days with zero so the line is honest
  const dmap = new Map(daily.map((d) => [d.d, d]));
  const trend = Array.from({ length: 14 }, (_, i) => { const d = addDays(today, i - 13); return { label: fmtDate(d).slice(0, 6), value: dmap.get(d)?.sales ?? 0, sub: `${dmap.get(d)?.orders ?? 0} orders` }; });

  return (
    <div>
      <LiveRefresh pollMs={20000} />
      <PageHeader title="Today" subtitle={fmtDate(today)} />
      {incoming[0].n > 0 && (
        <Link href="/orders" className="mb-4 flex items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <BellRing size={18} className="animate-pulse" /> {incoming[0].n} online order{incoming[0].n > 1 ? "s" : ""} waiting for acceptance →
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="kpi"><div className="text-xs font-medium text-[var(--muted)]">Sales</div><div className="mt-1 text-2xl font-semibold tracking-tight">{fmt(sum.sales)}</div><Delta now={sum.sales} prev={ysum.sales} /></div>
        <div className="kpi"><div className="text-xs font-medium text-[var(--muted)]">Orders</div><div className="mt-1 text-2xl font-semibold tracking-tight">{sum.orders}</div><Delta now={sum.orders} prev={ysum.orders} /></div>
        <Stat label="Avg order value" value={fmt(sum.avgOrder)} sub={`Yesterday ${fmt(ysum.avgOrder)}`} />
        <Stat label="Open orders now" value={String(open[0].n)} sub={sum.cancelled ? `${sum.cancelled} cancelled today` : "None cancelled"} tone={open[0].n > 6 ? "warn" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Sales by hour</h2><BarsChart data={hourly.map((h) => ({ label: h.label, value: h.sales, sub: `${h.orders} orders` }))} /></section>
        <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Last 14 days</h2><TrendChart data={trend} /></section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Top sellers today</h2>
          <HBars rows={top.map((i) => ({ label: i.name, value: i.revenue, sub: `${i.qty} sold` }))} /></section>
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Collections</h2>
          <HBars rows={pay.map((p) => ({ label: p.k.toUpperCase(), value: p.v }))} />
          <h2 className="mb-3 mt-5 text-sm font-semibold">Order mix</h2>
          <HBars rows={[...types.map((x) => ({ label: TYPE_LABEL[x.k] ?? x.k, value: x.v, sub: `${x.n}` })), ...channels.filter((c) => c.k !== "pos").map((x) => ({ label: CHANNEL_LABEL[x.k] ?? x.k, value: x.v, sub: `${x.n}` }))]} /></section>
        <section className="card p-4"><h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><AlertTriangle size={15} className="text-amber-600" /> Low stock</h2>
          {low.length === 0 ? <p className="py-6 text-center text-sm text-[var(--muted)]">All stock levels healthy.</p> : (
            <ul className="divide-y divide-stone-100 text-sm">{low.slice(0, 8).map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{l.name}</span><span className="font-medium text-red-600">{+l.qty.toFixed(2)} / {l.min} {l.unit}</span></li>)}</ul>
          )}
          {low.length > 0 && <Link href="/inventory" className="mt-2 inline-block text-xs font-medium text-brand-700">Open inventory →</Link>}
        </section>
      </div>
      <p className="mt-4 text-xs text-[var(--muted)]">Sales exclude cancelled orders. {fmtCompact(sum.discount)} discounts given · {fmtCompact(sum.tax)} GST included today.</p>
    </div>
  );
}
