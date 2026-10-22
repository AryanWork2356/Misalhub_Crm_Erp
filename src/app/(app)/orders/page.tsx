import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { businessDate, fmtTime } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { PageHeader, StatusBadge, TYPE_LABEL, CHANNEL_LABEL, Empty } from "@/components/ui";
import { LiveRefresh } from "@/components/live-refresh";
import IncomingOrders from "./incoming";

export const metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ date?: string; status?: string; type?: string; q?: string }> }) {
  const { user } = await requireUser("orders");
  const outletId = await currentOutletId(user);
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : businessDate();
  const db = await getDb();

  const conds = [eq(schema.orders.outletId, outletId), eq(schema.orders.businessDate, date)];
  if (sp.status) conds.push(eq(schema.orders.status, sp.status as never));
  if (sp.type) conds.push(eq(schema.orders.type, sp.type as never));
  if (sp.q) conds.push(sql`(${schema.orders.orderNo} ILIKE ${"%" + sp.q + "%"} OR ${schema.orders.customerName} ILIKE ${"%" + sp.q + "%"} OR ${schema.orders.customerPhone} ILIKE ${"%" + sp.q + "%"})`);
  const rows = await db.select().from(schema.orders).where(and(...conds)).orderBy(desc(schema.orders.createdAt)).limit(300);

  // online orders waiting for acceptance (no KOT yet)
  const incoming = await db.select().from(schema.orders).where(and(
    eq(schema.orders.outletId, outletId), eq(schema.orders.status, "new"), sql`${schema.orders.channel} <> 'pos'`,
    sql`NOT EXISTS (SELECT 1 FROM kots k WHERE k.order_id = ${schema.orders.id})`)).orderBy(schema.orders.createdAt);
  const incomingLines = incoming.length
    ? await db.select().from(schema.orderItems).where(sql`${schema.orderItems.orderId} IN (${sql.join(incoming.map((o) => sql`${o.id}`), sql`, `)})`)
    : [];

  const total = rows.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <LiveRefresh />
      <PageHeader title="Orders" subtitle={`${rows.length} orders · ${fmt(total)} on ${date}`}>
        <form className="flex flex-wrap gap-2">
          <input type="date" name="date" defaultValue={date} className="input w-auto" />
          <select name="status" defaultValue={sp.status ?? ""} className="input w-auto"><option value="">All status</option>{schema.ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
          <select name="type" defaultValue={sp.type ?? ""} className="input w-auto"><option value="">All types</option>{schema.ORDER_TYPES.map((s) => <option key={s} value={s}>{TYPE_LABEL[s]}</option>)}</select>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Order # / name / phone" className="input w-44" />
          <button className="btn-dark">Filter</button>
        </form>
      </PageHeader>

      {incoming.length > 0 && <IncomingOrders orders={incoming.map((o) => ({ id: o.id, orderNo: o.orderNo, channel: o.channel, type: o.type, customerName: o.customerName, customerPhone: o.customerPhone, address: o.deliveryAddress, total: o.total, notes: o.notes, createdAt: o.createdAt.toISOString(), lines: incomingLines.filter((l) => l.orderId === o.id).map((l) => ({ name: l.name, qty: l.qty, mods: l.modifiers.map((m) => m.name).join(", ") })) }))} />}

      {/* phone: one card per order so total/status are visible without sideways scrolling */}
      <div className="space-y-2 md:hidden">
        {rows.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="card block p-3 active:bg-stone-50">
            <div className="flex items-center justify-between gap-2"><span className="text-base font-semibold text-brand-700">#{o.orderNo}</span><span className="text-base font-semibold">{fmt(o.total)}</span></div>
            <div className="mt-0.5 text-sm text-[var(--muted)]">{fmtTime(o.createdAt)} · {TYPE_LABEL[o.type]}{o.channel !== "pos" ? ` · ${CHANNEL_LABEL[o.channel]}` : ""}{(o.customerName || o.customerPhone) ? ` · ${o.customerName || o.customerPhone}` : ""}</div>
            <div className="mt-2 flex gap-1.5"><StatusBadge s={o.status} /><StatusBadge s={o.paymentStatus} /></div>
          </Link>
        ))}
        {rows.length === 0 && <div className="card"><Empty>No orders found for this filter.</Empty></div>}
      </div>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">#</th><th className="th">Time</th><th className="th">Type</th><th className="th">Customer</th><th className="th">Status</th><th className="th">Payment</th><th className="th text-right">Total</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="td font-medium"><Link href={`/orders/${o.id}`} className="text-brand-700 hover:underline">#{o.orderNo}</Link></td>
                <td className="td text-[var(--muted)]">{fmtTime(o.createdAt)}</td>
                <td className="td">{TYPE_LABEL[o.type]} <span className="text-xs text-[var(--muted)]">{o.channel !== "pos" && `· ${CHANNEL_LABEL[o.channel]}`}</span></td>
                <td className="td">{o.customerName || o.customerPhone || <span className="text-stone-300">—</span>}</td>
                <td className="td"><StatusBadge s={o.status} /></td>
                <td className="td"><StatusBadge s={o.paymentStatus} /></td>
                <td className="td text-right font-medium">{fmt(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No orders found for this filter.</Empty>}
      </div>
    </div>
  );
}
