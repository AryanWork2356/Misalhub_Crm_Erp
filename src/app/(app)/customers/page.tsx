import Link from "next/link";
import { desc, sql, or, ilike } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { fmt } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { SEGMENT_LABEL, SEGMENT_STYLE, segmentOf, type Segment } from "@/lib/crm";
import { PageHeader, Stat, Empty } from "@/components/ui";
import NewCustomer from "./new-customer";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

const SEGS: (Segment | "all")[] = ["all", "vip", "regular", "new", "at_risk", "lost"];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; seg?: string }> }) {
  await requireUser("customers");
  const sp = await searchParams;
  const db = await getDb();
  const all = await db.select().from(schema.customers)
    .where(sp.q ? or(ilike(schema.customers.name, `%${sp.q}%`), ilike(schema.customers.phone, `%${sp.q}%`)) : undefined)
    .orderBy(desc(schema.customers.totalSpent)).limit(1000);
  const rows = all.map((c) => ({ c, seg: segmentOf(c) }));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.seg, (counts.get(r.seg) ?? 0) + 1);
  const shown = (sp.seg && sp.seg !== "all" ? rows.filter((r) => r.seg === sp.seg) : rows).slice(0, 200);
  const [tot] = await db.select({ n: sql<number>`COUNT(*)::int`, spent: sql<number>`COALESCE(SUM(total_spent),0)::bigint`, pts: sql<number>`COALESCE(SUM(loyalty_points),0)::int` }).from(schema.customers);
  const repeat = rows.filter((r) => r.c.visits >= 2).length;

  return (
    <div>
      <PageHeader title="Customers" subtitle="Everyone who gave a phone number at billing is added automatically."><NewCustomer /></PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={String(tot.n)} />
        <Stat label="Repeat rate" value={rows.length ? `${Math.round((repeat / rows.length) * 100)}%` : "—"} sub={`${repeat} came back`} />
        <Stat label="Lifetime sales" value={fmt(Number(tot.spent))} />
        <Stat label="Loyalty points out" value={String(tot.pts)} sub="1 point = ₹1" />
      </div>
      <form className="mb-3 flex flex-wrap items-center gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or phone" className="input w-56" />
        <input type="hidden" name="seg" value={sp.seg ?? "all"} />
        <button className="btn-dark">Search</button>
        <div className="ml-auto flex gap-1 overflow-x-auto text-sm">
          {SEGS.map((s) => (
            <Link key={s} href={`/customers?seg=${s}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={`rounded-full border px-3 py-1 font-medium ${(sp.seg ?? "all") === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white text-stone-600"}`}>
              {s === "all" ? "All" : SEGMENT_LABEL[s]} <span className="text-xs text-[var(--muted)]">{s === "all" ? rows.length : counts.get(s) ?? 0}</span>
            </Link>
          ))}
        </div>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Customer</th><th className="th">Segment</th><th className="th text-right">Visits</th><th className="th text-right">Spent</th><th className="th">Last visit</th><th className="th text-right">Points</th></tr></thead>
          <tbody>
            {shown.map(({ c, seg }) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="td"><Link href={`/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name || "Unnamed"}</Link><div className="text-xs text-[var(--muted)]">{c.phone}</div></td>
                <td className="td"><span className={`badge ${SEGMENT_STYLE[seg]}`}>{SEGMENT_LABEL[seg]}</span></td>
                <td className="td text-right tabular-nums">{c.visits}</td>
                <td className="td text-right tabular-nums">{fmt(c.totalSpent)}</td>
                <td className="td text-[var(--muted)]">{c.lastVisitAt ? fmtDate(c.lastVisitAt.toISOString().slice(0, 10)) : "—"}</td>
                <td className="td text-right tabular-nums">{c.loyaltyPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No customers match.</Empty>}
      </div>
    </div>
  );
}
