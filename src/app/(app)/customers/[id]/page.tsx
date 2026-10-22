import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { fmt } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { SEGMENT_LABEL, SEGMENT_STYLE, segmentOf, waLink } from "@/lib/crm";
import { PageHeader, Stat, StatusBadge, TYPE_LABEL } from "@/components/ui";
import { HBars } from "@/components/viz";
import PointsAdjust from "./points-adjust";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("customers");
  const { id } = await params;
  const db = await getDb();
  const [c] = await db.select().from(schema.customers).where(eq(schema.customers.id, Number(id)));
  if (!c) notFound();
  const orders = await db.select().from(schema.orders).where(eq(schema.orders.customerId, c.id)).orderBy(desc(schema.orders.createdAt)).limit(30);
  const txns = await db.select().from(schema.loyaltyTxns).where(eq(schema.loyaltyTxns.customerId, c.id)).orderBy(desc(schema.loyaltyTxns.createdAt)).limit(15);
  const fav = await db.execute(sql`SELECT oi.name, SUM(oi.qty)::int AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.customer_id = ${c.id} AND o.status <> 'cancelled' AND oi.status <> 'cancelled' GROUP BY oi.name ORDER BY qty DESC LIMIT 5`);
  const favRows = fav.rows as { name: string; qty: number }[];
  const seg = segmentOf(c);

  return (
    <div>
      <Link href="/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-ink"><ArrowLeft size={14} /> Customers</Link>
      <PageHeader title={c.name || "Unnamed customer"} subtitle={`${c.phone}${c.birthday ? ` · Birthday ${c.birthday.slice(5)}` : ""}`}>
        <span className={`badge ${SEGMENT_STYLE[seg]}`}>{SEGMENT_LABEL[seg]}</span>
        <a href={`tel:${c.phone}`} className="btn-ghost btn-sm"><Phone size={14} /> Call</a>
        {c.marketingOptIn && <a href={waLink(c.phone, `Hi ${c.name.split(" ")[0] || "there"}! 🍲 This is Misal Hub, Mira Road.`)} target="_blank" rel="noreferrer" className="btn-primary btn-sm"><MessageCircle size={14} /> WhatsApp</a>}
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Visits" value={String(c.visits)} />
        <Stat label="Lifetime spend" value={fmt(c.totalSpent)} />
        <Stat label="Avg per visit" value={c.visits ? fmt(Math.round(c.totalSpent / c.visits)) : "—"} />
        <Stat label="Loyalty points" value={String(c.loyaltyPoints)} sub={`Worth ${fmt(c.loyaltyPoints * 100)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <h3 className="px-4 pt-4 text-sm font-semibold">Order history</h3>
          <table className="mt-2 w-full">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-stone-100"><td className="td"><Link href={`/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">#{o.orderNo}</Link></td><td className="td text-[var(--muted)]">{fmtDateTime(o.createdAt)}</td><td className="td">{TYPE_LABEL[o.type]}</td><td className="td"><StatusBadge s={o.status} /></td><td className="td text-right font-medium">{fmt(o.total)}</td></tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="p-6 text-center text-sm text-[var(--muted)]">No orders yet.</p>}
        </div>
        <div className="space-y-4">
          <section className="card p-4"><h3 className="mb-3 text-sm font-semibold">Favourites</h3><HBars money={false} unit="×" rows={favRows.map((f) => ({ label: f.name, value: f.qty }))} /></section>
          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Loyalty ledger</h3>{isManagerUp(user.role) && <PointsAdjust customerId={c.id} />}</div>
            <ul className="divide-y divide-stone-100 text-sm">{txns.map((t) => <li key={t.id} className="flex justify-between py-1.5"><span className="text-[var(--muted)]">{t.note || t.kind}</span><span className={t.points < 0 ? "text-red-600" : "text-emerald-700"}>{t.points > 0 ? "+" : ""}{t.points}</span></li>)}</ul>
            {txns.length === 0 && <p className="py-3 text-center text-sm text-[var(--muted)]">No points activity.</p>}
          </section>
          {c.address && <section className="card p-4 text-sm"><h3 className="mb-1 text-sm font-semibold">Address</h3>{c.address}</section>}
        </div>
      </div>
    </div>
  );
}
