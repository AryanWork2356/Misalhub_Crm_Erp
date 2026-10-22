import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { fmt } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader, StatusBadge, TYPE_LABEL, CHANNEL_LABEL } from "@/components/ui";
import { BillReceipt } from "@/components/receipt";
import OrderActions from "./actions";

export const dynamic = "force-dynamic";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser("orders");
  const outletId = await currentOutletId(user);
  const { id } = await params;
  const db = await getDb();
  const [order] = await db.select().from(schema.orders).where(and(eq(schema.orders.id, Number(id)), eq(schema.orders.outletId, outletId)));
  if (!order) notFound();
  const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId));
  const lines = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)).orderBy(schema.orderItems.id);
  const pays = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order.id));
  const table = order.tableId ? (await db.select().from(schema.diningTables).where(eq(schema.diningTables.id, order.tableId)))[0] : null;
  const live = lines.filter((l) => l.status !== "cancelled");

  return (
    <div>
      <Link href="/orders" className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-ink"><ArrowLeft size={14} /> Orders</Link>
      <PageHeader title={`Order #${order.orderNo}`} subtitle={`${TYPE_LABEL[order.type]} · ${CHANNEL_LABEL[order.channel]} · ${fmtDateTime(order.createdAt)}${table ? ` · Table ${table.name}` : ""}`}>
        <StatusBadge s={order.status} /><StatusBadge s={order.paymentStatus} />
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--border)]"><tr><th className="th">Item</th><th className="th">Status</th><th className="th text-right">Qty</th><th className="th text-right">Amount</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className={`border-b border-stone-100 last:border-0 ${l.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                    <td className="td"><div className="font-medium">{l.name}</div>{l.modifiers.length > 0 && <div className="text-xs text-[var(--muted)]">{l.modifiers.map((m) => m.name).join(", ")}</div>}{l.notes && <div className="text-xs italic text-[var(--muted)]">{l.notes}</div>}</td>
                    <td className="td"><StatusBadge s={l.status} /></td><td className="td text-right">{l.qty}</td><td className="td text-right">{fmt(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="space-y-1 border-t border-[var(--border)] p-4 text-sm">
              <Row k="Subtotal" v={fmt(order.subtotal)} />
              {order.discount > 0 && <Row k={`Discount${order.discountReason ? ` (${order.discountReason})` : ""}${order.couponCode ? ` · ${order.couponCode}` : ""}`} v={`− ${fmt(order.discount)}`} />}
              {order.deliveryFee > 0 && <Row k="Delivery" v={fmt(order.deliveryFee)} />}
              <Row k={outlet.taxInclusive ? "GST (included)" : "GST"} v={fmt(order.tax, { decimals: true })} />
              {order.roundOff !== 0 && <Row k="Round off" v={(order.roundOff / 100).toFixed(2)} />}
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-semibold"><dt>Total</dt><dd>{fmt(order.total)}</dd></div>
            </dl>
          </div>
          <div className="card p-4">
            <h3 className="mb-2 text-sm font-semibold">Payments</h3>
            {pays.length === 0 ? <p className="text-sm text-[var(--muted)]">No payments recorded.</p> : (
              <ul className="divide-y divide-stone-100 text-sm">{pays.map((p) => <li key={p.id} className="flex justify-between py-1.5"><span className="uppercase">{p.method} <span className="text-xs normal-case text-[var(--muted)]">{p.reference}</span></span><span className={p.amount < 0 ? "text-red-600" : ""}>{fmt(p.amount)}</span></li>)}</ul>
            )}
            {order.cancelReason && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Cancelled: {order.cancelReason}</p>}
          </div>
          <OrderActions orderId={order.id} status={order.status} canRefund={isManagerUp(user.role)} paid={order.paid} />
        </div>
        <div className="card h-fit p-3">
          <BillReceipt data={{ order, outlet, lines: live, payments: pays, table: table?.name ?? null }} />
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><dt className="text-[var(--muted)]">{k}</dt><dd>{v}</dd></div>;
