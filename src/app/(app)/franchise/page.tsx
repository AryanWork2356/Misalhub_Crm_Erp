import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { addDays, businessDate, fmtDate } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { outletComparison } from "@/lib/reports";
import { PageHeader, Stat, Tabs, Empty } from "@/components/ui";
import { HBars } from "@/components/viz";
import { LeadBoard, RoyaltyPrint } from "./franchise-client";

export const metadata = { title: "Franchise" };
export const dynamic = "force-dynamic";

export default async function FranchisePage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  await requireUser("franchise");
  const sp = await searchParams;
  const tab = sp.tab ?? "outlets";
  const today = businessDate();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const from = tab === "royalty" ? `${month}-01` : addDays(today, -29);
  const [y, m] = month.split("-").map(Number);
  const to = tab === "royalty" ? `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` : today;
  const db = await getDb();
  const comp = await outletComparison(from, to);
  let body: React.ReactNode;

  if (tab === "leads") {
    const leads = await db.select().from(schema.franchiseLeads).orderBy(desc(schema.franchiseLeads.createdAt));
    body = <LeadBoard leads={leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, city: l.city, budget: l.budget, message: l.message, status: l.status, notes: l.notes, created: fmtDate(l.createdAt.toISOString().slice(0, 10)) }))} />;
  } else if (tab === "royalty") {
    const fr = comp.filter((c) => c.outlet.isFranchise);
    body = fr.length === 0 ? <div className="card"><Empty>No franchise outlets yet. Mark an outlet as franchise in Settings → Outlet &amp; billing.</Empty></div> : (
      <div className="space-y-4">{fr.map((c) => {
        const net = c.sales - c.tax;
        return <RoyaltyPrint key={c.outlet.id} data={{ outlet: c.outlet.name, franchisee: c.outlet.franchiseeName, month, sales: c.sales, tax: c.tax, net, pct: Number(c.outlet.royaltyPct), royalty: c.royalty, orders: c.orders }} />;
      })}</div>
    );
  } else {
    const total = comp.reduce((s, c) => s + c.sales, 0);
    const hq = comp.filter((c) => !c.outlet.isFranchise);
    body = (
      <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Network sales (30d)" value={fmt(total)} /><Stat label="Outlets" value={String(comp.length)} sub={`${comp.filter((c) => c.outlet.isFranchise).length} franchise · ${hq.length} own`} />
          <Stat label="Orders (30d)" value={String(comp.reduce((s, c) => s + c.orders, 0))} /><Stat label="Royalty receivable" value={fmt(comp.reduce((s, c) => s + c.royalty, 0))} sub="last 30 days" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="card overflow-x-auto"><table className="w-full min-w-[640px]">
            <thead className="border-b border-[var(--border)]"><tr><th className="th">Outlet</th><th className="th text-right">Sales</th><th className="th text-right">Orders</th><th className="th text-right">Avg order</th><th className="th text-right">Expenses</th><th className="th text-right">Royalty</th></tr></thead>
            <tbody>{[...comp].sort((a, b) => b.sales - a.sales).map((c) => (
              <tr key={c.outlet.id} className="border-b border-stone-100 last:border-0"><td className="td"><div className="font-medium">{c.outlet.name}</div><div className="text-xs text-[var(--muted)]">{c.outlet.isFranchise ? `Franchise · ${c.outlet.franchiseeName || "—"} · ${c.outlet.royaltyPct}%` : "Company-owned"}</div></td>
                <td className="td text-right font-medium tabular-nums">{fmt(c.sales)}</td><td className="td text-right tabular-nums">{c.orders}</td><td className="td text-right tabular-nums">{fmt(c.avgOrder)}</td><td className="td text-right tabular-nums">{fmt(c.expenses)}</td><td className="td text-right tabular-nums">{c.royalty ? fmt(c.royalty) : "—"}</td></tr>))}</tbody></table></section>
          <section className="card h-fit p-4"><h3 className="mb-3 text-sm font-semibold">Sales share</h3><HBars rows={comp.map((c) => ({ label: c.outlet.name.replace("Misal Hub – ", ""), value: c.sales }))} /></section>
        </div>
        <p className="mt-4 text-xs text-[var(--muted)]">The master menu, recipes and coupons are managed once by head office and apply to every outlet. Outlet managers can only set a local price or mark items sold out.</p>
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Franchise" subtitle="Network performance, royalty statements and enquiries">
        {tab === "royalty" && <form className="flex items-center gap-2"><input type="hidden" name="tab" value="royalty" /><input type="month" name="month" defaultValue={month} className="input w-auto py-1" aria-label="Month" /><button className="btn-dark btn-sm">Go</button></form>}
        <Link href="/settings?outlet=new" className="btn-primary">+ Add outlet</Link>
      </PageHeader>
      <Tabs base="/franchise" extra={{ month: sp.month ?? "" }} current={tab} tabs={[{ id: "outlets", label: "Outlets" }, { id: "royalty", label: "Royalty statements" }, { id: "leads", label: "Franchise leads" }]} />
      {body}
    </div>
  );
}
