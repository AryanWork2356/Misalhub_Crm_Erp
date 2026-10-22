import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { expectedCash } from "@/lib/finance";
import { businessDate, fmtDateTime } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { paymentSplit, summary } from "@/lib/reports";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { ShiftControls, ZReport } from "./register-client";

export const metadata = { title: "Cash register" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { user } = await requireUser("register");
  const outletId = await currentOutletId(user);
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : businessDate();
  const db = await getDb();
  const [open] = await db.select().from(schema.registerShifts).where(and(eq(schema.registerShifts.outletId, outletId), isNull(schema.registerShifts.closedAt)));
  const live = open ? await expectedCash(outletId, open.openedAt, open.openingCash) : null;
  const history = await db.select({ s: schema.registerShifts, opener: schema.users.name }).from(schema.registerShifts)
    .innerJoin(schema.users, eq(schema.users.id, schema.registerShifts.openedBy)).where(eq(schema.registerShifts.outletId, outletId)).orderBy(desc(schema.registerShifts.openedAt)).limit(15);
  const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId));
  const scope = { outletIds: [outletId], from: date, to: date };
  const [sum, pay] = await Promise.all([summary(scope), paymentSplit(scope)]);

  return (
    <div>
      <PageHeader title="Cash register" subtitle="Open a shift with the float, close it with the counted cash — differences are tracked." />
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <section className="card p-4">
            {open && live ? (
              <>
                <div className="mb-3 flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" /><span className="text-sm font-semibold">Shift open since {fmtDateTime(open.openedAt)}</span></div>
                <dl className="mb-4 space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-[var(--muted)]">Opening float</dt><dd>{fmt(open.openingCash)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--muted)]">+ Cash received</dt><dd>{fmt(live.cashIn)}</dd></div>
                  <div className="flex justify-between"><dt className="text-[var(--muted)]">− Cash expenses</dt><dd>{fmt(live.cashOut)}</dd></div>
                  <div className="flex justify-between border-t border-[var(--border)] pt-1.5 text-base font-semibold"><dt>Expected in drawer</dt><dd>{fmt(live.expected)}</dd></div>
                </dl>
              </>
            ) : <p className="mb-3 text-sm text-[var(--muted)]">No shift is open. Count the float in the drawer and open a shift to start.</p>}
            <ShiftControls isOpen={!!open} />
          </section>
          <section className="card p-4"><h3 className="mb-2 text-sm font-semibold">Recent shifts</h3>
            {history.length === 0 ? <Empty>No shifts yet.</Empty> : <ul className="divide-y divide-stone-100 text-sm">
              {history.map(({ s, opener }) => {
                const v = s.closingCash != null && s.expectedCash != null ? s.closingCash - s.expectedCash : null;
                return <li key={s.id} className="py-2"><div className="flex justify-between"><span>{fmtDateTime(s.openedAt)}</span><span className="text-xs text-[var(--muted)]">{opener}</span></div>
                  <div className="flex justify-between text-xs text-[var(--muted)]"><span>{s.closedAt ? `Counted ${fmt(s.closingCash ?? 0)}` : "Open"}</span>{v != null && <span className={v === 0 ? "text-emerald-700" : v < 0 ? "font-semibold text-red-600" : "font-semibold text-amber-700"}>{v === 0 ? "Balanced" : `${v > 0 ? "Over" : "Short"} ${fmt(Math.abs(v))}`}</span>}</div></li>;
              })}</ul>}
          </section>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales" value={fmt(sum.sales)} /><Stat label="Orders" value={String(sum.orders)} /><Stat label="Discounts" value={fmt(sum.discount)} /><Stat label="Cancelled" value={String(sum.cancelled)} sub={fmt(sum.cancelledValue)} />
          </div>
          <ZReport date={date} outlet={{ name: outlet.name, address: outlet.address }} sum={{ sales: sum.sales, orders: sum.orders, tax: sum.tax, discount: sum.discount, delivery: sum.delivery, cancelled: sum.cancelled, cancelledValue: sum.cancelledValue }} pay={pay.map((p) => ({ k: p.k, v: p.v, n: p.n }))} />
        </div>
      </div>
    </div>
  );
}
