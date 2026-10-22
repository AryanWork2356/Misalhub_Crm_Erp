import Link from "next/link";
import { eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isHeadOffice } from "@/lib/permissions";
import { addDays, businessDate, fmtDate, monthStart } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { categorySales, dailySeries, gstReport, hourlySeries, paymentSplit, profitAndLoss, recipeCosts, splitBy, summary, topItems, weekdayHour } from "@/lib/reports";
import { PageHeader, Stat, Tabs, CHANNEL_LABEL, TYPE_LABEL } from "@/components/ui";
import { BarsChart, TrendChart } from "@/components/charts";
import { Delta, HBars, Heatmap } from "@/components/viz";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type SP = { tab?: string; from?: string; to?: string; outlet?: string };
const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { user } = await requireUser("reports");
  const own = await currentOutletId(user);
  const sp = await searchParams;
  const db = await getDb();
  const today = businessDate();
  const from = isDate(sp.from) ? sp.from! : addDays(today, -6);
  const to = isDate(sp.to) ? sp.to! : today;
  const tab = sp.tab ?? "sales";
  const head = isHeadOffice(user.role);
  const outlets = head ? await db.select({ id: schema.outlets.id, name: schema.outlets.name }).from(schema.outlets).where(eq(schema.outlets.active, true)) : [];
  const scopeIds = head && sp.outlet === "all" ? outlets.map((o) => o.id) : [own];
  const scope = { outletIds: scopeIds, from, to };
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  const prev = { outletIds: scopeIds, from: addDays(from, -days), to: addDays(from, -1) };

  const qs = (o: Partial<SP>) => new URLSearchParams(Object.entries({ tab, from, to, outlet: sp.outlet ?? "", ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const presets: [string, string, string][] = [
    ["Today", today, today], ["Yesterday", addDays(today, -1), addDays(today, -1)], ["Last 7 days", addDays(today, -6), today],
    ["Last 30 days", addDays(today, -29), today], ["This month", monthStart(today), today],
  ];

  let body: React.ReactNode = null;
  if (tab === "sales") {
    const [s, p, daily, hourly, heat, types, channels, pay] = await Promise.all([summary(scope), summary(prev), dailySeries(scope), hourlySeries(scope), weekdayHour(scope), splitBy(scope, "type"), splitBy(scope, "channel"), paymentSplit(scope)]);
    const dmap = new Map(daily.map((d) => [d.d, d]));
    const series = Array.from({ length: Math.min(days, 92) }, (_, i) => { const d = addDays(from, i); return { label: fmtDate(d).slice(0, 6), value: dmap.get(d)?.sales ?? 0, sub: `${dmap.get(d)?.orders ?? 0} orders` }; });
    body = (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="kpi"><div className="text-xs font-medium text-[var(--muted)]">Sales</div><div className="mt-1 text-2xl font-semibold">{fmt(s.sales)}</div><Delta now={s.sales} prev={p.sales} /></div>
          <div className="kpi"><div className="text-xs font-medium text-[var(--muted)]">Orders</div><div className="mt-1 text-2xl font-semibold">{s.orders}</div><Delta now={s.orders} prev={p.orders} /></div>
          <Stat label="Avg order value" value={fmt(s.avgOrder)} sub={`Prev ${fmt(p.avgOrder)}`} />
          <Stat label="Discounts given" value={fmt(s.discount)} sub={s.sales ? `${((s.discount / (s.sales + s.discount)) * 100).toFixed(1)}% of gross` : undefined} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Daily sales</h2><TrendChart data={series} /></section>
          <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Sales by hour of day</h2><BarsChart data={hourly.map((h) => ({ label: h.label, value: h.sales, sub: `${h.orders} orders` }))} /></section>
        </div>
        <section className="card mt-4 p-4"><h2 className="mb-3 text-sm font-semibold">When are guests ordering? <span className="font-normal text-[var(--muted)]">(order count by weekday and hour)</span></h2><Heatmap cells={heat} /></section>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">By order type</h2><HBars rows={types.map((t) => ({ label: TYPE_LABEL[t.k] ?? t.k, value: t.v, sub: `${t.n}` }))} /></section>
          <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">By channel</h2><HBars rows={channels.map((t) => ({ label: CHANNEL_LABEL[t.k] ?? t.k, value: t.v, sub: `${t.n}` }))} /></section>
          <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Payment collections</h2><HBars rows={pay.map((t) => ({ label: t.k.toUpperCase(), value: t.v }))} /></section>
        </div>
        <section className="card mt-4 overflow-x-auto"><h2 className="px-4 pt-4 text-sm font-semibold">Day by day</h2>
          <table className="mt-2 w-full"><thead className="border-b border-[var(--border)]"><tr><th className="th">Date</th><th className="th text-right">Orders</th><th className="th text-right">Sales</th><th className="th text-right">Avg order</th></tr></thead>
            <tbody>{[...daily].reverse().map((d) => <tr key={d.d} className="border-b border-stone-100 last:border-0"><td className="td">{fmtDate(d.d)}</td><td className="td text-right tabular-nums">{d.orders}</td><td className="td text-right font-medium tabular-nums">{fmt(d.sales)}</td><td className="td text-right tabular-nums text-[var(--muted)]">{fmt(Math.round(d.sales / d.orders))}</td></tr>)}</tbody></table></section>
      </>
    );
  } else if (tab === "items") {
    const [items, cats, costs] = await Promise.all([topItems(scope, 200), categorySales(scope), recipeCosts(scopeIds)]);
    const rows = items.map((i) => { const unitCost = costs.get(i.id); const cost = unitCost != null ? unitCost * i.qty : null; return { ...i, cost, margin: cost != null ? i.revenue - cost : null }; });
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="card overflow-x-auto"><table className="w-full min-w-[640px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Item</th><th className="th">Category</th><th className="th text-right">Qty</th><th className="th text-right">Revenue</th><th className="th text-right">Est. cost</th><th className="th text-right">Margin</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-stone-100 last:border-0"><td className="td font-medium">{r.name}</td><td className="td text-[var(--muted)]">{r.category}</td><td className="td text-right tabular-nums">{r.qty}</td><td className="td text-right tabular-nums">{fmt(r.revenue)}</td><td className="td text-right tabular-nums text-[var(--muted)]">{r.cost != null ? fmt(Math.round(r.cost)) : "—"}</td><td className="td text-right tabular-nums">{r.margin != null ? <span className={r.margin / r.revenue < 0.5 ? "text-amber-700" : "text-emerald-700"}>{fmt(Math.round(r.margin))}</span> : "—"}</td></tr>)}</tbody></table></section>
        <section className="card h-fit p-4"><h2 className="mb-3 text-sm font-semibold">Category sales</h2><HBars rows={cats.map((c) => ({ label: c.name, value: c.revenue, sub: `${c.qty}` }))} /></section>
      </div>
    );
  } else if (tab === "tax") {
    const [g, s, pay] = await Promise.all([gstReport(scope), summary(scope), paymentSplit(scope)]);
    body = (
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-x-auto"><h2 className="px-4 pt-4 text-sm font-semibold">GST summary</h2>
          <table className="mt-2 w-full"><thead className="border-b border-[var(--border)]"><tr><th className="th">Rate</th><th className="th text-right">Taxable value</th><th className="th text-right">CGST</th><th className="th text-right">SGST</th></tr></thead>
            <tbody>{g.rows.map((r) => <tr key={r.rate} className="border-b border-stone-100"><td className="td">{r.rate}%</td><td className="td text-right tabular-nums">{fmt(r.taxable, { decimals: true })}</td><td className="td text-right tabular-nums">{fmt(r.cgst, { decimals: true })}</td><td className="td text-right tabular-nums">{fmt(r.sgst, { decimals: true })}</td></tr>)}
              <tr className="font-semibold"><td className="td">Total tax</td><td className="td" /><td className="td text-right tabular-nums" colSpan={2}>{fmt(g.total, { decimals: true })}</td></tr></tbody></table>
          <p className="px-4 pb-4 text-xs text-[var(--muted)]">Computed from bill lines after discounts. Share with your CA for GSTR-1/3B; confirm the applicable rate for each item category.</p></section>
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Settlement by payment mode</h2><HBars rows={pay.map((p) => ({ label: p.k.toUpperCase(), value: p.v, sub: `${p.n} txns` }))} />
          <dl className="mt-5 space-y-1.5 border-t border-[var(--border)] pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Gross sales (billed)</dt><dd>{fmt(s.sales)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Discounts</dt><dd>{fmt(s.discount)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Delivery charges</dt><dd>{fmt(s.delivery)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Cancelled ({s.cancelled})</dt><dd>{fmt(s.cancelledValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-[var(--muted)]">Unpaid / receivable</dt><dd className={s.unpaid ? "text-red-600" : ""}>{fmt(s.unpaid)}</dd></div></dl></section>
      </div>
    );
  } else {
    const pl = await profitAndLoss(scope);
    const pct = (n: number) => (pl.netSales ? ((n / pl.netSales) * 100).toFixed(1) : "0");
    body = (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Money in vs money out</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">The simple view: what you earned minus everything you spent.</p>
            <dl className="space-y-2 text-sm">
              <PL k="Sales (bills, incl. GST)" v={fmt(pl.sales)} /><PL k="− GST (belongs to the government)" v={fmt(pl.tax)} muted /><PL k="You earned (net sales)" v={fmt(pl.netSales)} bold />
              <PL k="− Everything you spent" v={fmt(pl.expenses)} muted />
              <div className={`flex justify-between border-t border-[var(--border)] pt-2 text-lg font-semibold ${pl.cashProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}><dt>{pl.cashProfit >= 0 ? "Profit" : "Loss"}</dt><dd className="tabular-nums">{fmt(Math.round(pl.cashProfit))}</dd></div>
              <div className="text-xs text-[var(--muted)]">Profit margin {pct(pl.cashProfit)}% of net sales</div>
            </dl>
          </section>
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Profit using recipe food cost</h2>
            <p className="mb-3 text-xs text-[var(--muted)]">Uses what the food actually cost to make, not what you bought.</p>
            <dl className="space-y-2 text-sm">
              <PL k="Net sales" v={fmt(pl.netSales)} /><PL k="− Food cost (from recipes)" v={fmt(Math.round(pl.cogs))} muted /><PL k="Gross profit" v={fmt(Math.round(pl.gross))} bold />
              <PL k="− Other expenses (rent, salary, gas…)" v={fmt(pl.opex)} muted />
              <div className={`flex justify-between border-t border-[var(--border)] pt-2 text-lg font-semibold ${pl.net >= 0 ? "text-emerald-700" : "text-red-600"}`}><dt>Net profit</dt><dd className="tabular-nums">{fmt(Math.round(pl.net))}</dd></div>
              <div className="text-xs text-[var(--muted)]">Food cost {pct(pl.cogs)}% · net margin {pct(pl.net)}%</div>
            </dl>
            {pl.recipeCoverage < 0.9 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Only {Math.round(pl.recipeCoverage * 100)}% of item sales have a recipe, so food cost is understated and this profit looks better than it is. Add the missing recipes in Inventory → Recipes, or trust the left card.</p>}
          </section>
        </div>
        <section className="card p-4"><h2 className="mb-3 text-sm font-semibold">Where the money went</h2><HBars rows={pl.expenseRows.map((e) => ({ label: e.category, value: e.v }))} />
          <p className="mt-3 text-xs text-[var(--muted)]">Why two profit numbers? The left card is cash in minus cash out for the period (stock bought but not yet sold counts as spent). The right card matches ingredient cost to what was actually sold, and leaves out “Raw material” spending so it isn’t counted twice. Both exclude GST.</p></section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle={`${fmtDate(from)} – ${fmtDate(to)}${scopeIds.length > 1 ? " · all outlets" : ""}`}>
        {head && outlets.length > 1 && (
          <div className="flex rounded-lg bg-stone-100 p-0.5 text-sm font-medium">
            <Link href={`/reports?${qs({ outlet: "" })}`} className={`rounded-md px-3 py-1 ${scopeIds.length === 1 ? "bg-white shadow-sm" : "text-stone-500"}`}>This outlet</Link>
            <Link href={`/reports?${qs({ outlet: "all" })}`} className={`rounded-md px-3 py-1 ${scopeIds.length > 1 ? "bg-white shadow-sm" : "text-stone-500"}`}>All outlets</Link>
          </div>
        )}
        <a href={`/api/export?${new URLSearchParams({ type: tab === "items" ? "items" : tab === "tax" ? "gst" : "orders", from, to, outlet: sp.outlet ?? "" })}`} className="btn-ghost btn-sm"><Download size={14} /> CSV</a>
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {presets.map(([label, f, t]) => <Link key={label} href={`/reports?${qs({ from: f, to: t })}`} className={`rounded-full border px-3 py-1 text-sm font-medium ${from === f && to === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white text-stone-600"}`}>{label}</Link>)}
        <form className="flex w-full flex-wrap items-center gap-1.5 text-sm sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={tab} /><input type="hidden" name="outlet" value={sp.outlet ?? ""} />
          <input type="date" name="from" defaultValue={from} className="input w-auto min-w-0 flex-1 py-1 sm:flex-none" aria-label="From" /> – <input type="date" name="to" defaultValue={to} className="input w-auto min-w-0 flex-1 py-1 sm:flex-none" aria-label="To" />
          <button className="btn-dark btn-sm">Apply</button>
        </form>
      </div>
      <Tabs base="/reports" extra={{ from, to, outlet: sp.outlet ?? "" }} current={tab} tabs={[{ id: "sales", label: "Sales" }, { id: "items", label: "Items & margin" }, { id: "tax", label: "GST & payments" }, { id: "pnl", label: "Profit & loss" }]} />
      {body}
    </div>
  );
}

const PL = ({ k, v, muted, bold }: { k: string; v: string; muted?: boolean; bold?: boolean }) => (
  <div className={`flex justify-between ${muted ? "text-[var(--muted)]" : ""} ${bold ? "font-semibold" : ""}`}><dt>{k}</dt><dd className="tabular-nums">{v}</dd></div>
);
