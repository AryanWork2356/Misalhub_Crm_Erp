import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { businessDate, fmtDate, monthStart } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { expenseTotals } from "@/lib/reports";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { HBars } from "@/components/viz";
import { ExpenseForm, DeleteExpense } from "./expense-client";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { user } = await requireUser("expenses");
  const outletId = await currentOutletId(user);
  const sp = await searchParams;
  const today = businessDate();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : monthStart(today);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
  const db = await getDb();
  const rows = await db.select().from(schema.expenses).where(and(eq(schema.expenses.outletId, outletId), gte(schema.expenses.expenseDate, from), lte(schema.expenses.expenseDate, to))).orderBy(desc(schema.expenses.expenseDate), desc(schema.expenses.id)).limit(300);
  const byCat = await expenseTotals({ outletIds: [outletId], from, to });
  const total = byCat.reduce((s, c) => s + c.v, 0);
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);

  return (
    <div>
      <PageHeader title="Expenses" subtitle={`${fmtDate(from)} – ${fmtDate(to)}`}>
        <form className="flex w-full flex-wrap items-center gap-1.5 text-sm sm:w-auto"><input type="date" name="from" defaultValue={from} className="input w-auto min-w-0 flex-1 py-1 sm:flex-none" aria-label="From" /> – <input type="date" name="to" defaultValue={to} className="input w-auto min-w-0 flex-1 py-1 sm:flex-none" aria-label="To" /><button className="btn-dark btn-sm">Apply</button></form>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total expenses" value={fmt(total)} /><Stat label="Per day" value={fmt(Math.round(total / days))} /><Stat label="Entries" value={String(rows.length)} /><Stat label="Biggest category" value={byCat[0]?.category ?? "—"} sub={byCat[0] ? fmt(byCat[0].v) : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <ExpenseForm today={today} categories={[...schema.EXPENSE_CATEGORIES]} />
          <div className="space-y-2 md:hidden">
            {rows.map((e) => (
              <div key={e.id} className="card flex items-start justify-between gap-3 p-3">
                <div className="min-w-0"><div className="font-semibold">{e.category}</div><div className="text-sm text-[var(--muted)]">{fmtDate(e.expenseDate)} · {e.method.toUpperCase()}{e.note ? ` · ${e.note}` : ""}</div></div>
                <div className="flex shrink-0 items-center gap-1"><span className="text-base font-semibold">{fmt(e.amount)}</span>{isManagerUp(user.role) && <DeleteExpense id={e.id} />}</div>
              </div>
            ))}
            {rows.length === 0 && <div className="card"><Empty>No expenses in this period.</Empty></div>}
          </div>
          <section className="card hidden overflow-x-auto md:block"><table className="w-full min-w-[560px]">
            <thead className="border-b border-[var(--border)]"><tr><th className="th">Date</th><th className="th">Category</th><th className="th">Note</th><th className="th">Mode</th><th className="th text-right">Amount</th><th className="th" /></tr></thead>
            <tbody>{rows.map((e) => <tr key={e.id} className="border-b border-stone-100 last:border-0"><td className="td">{fmtDate(e.expenseDate)}</td><td className="td">{e.category}</td><td className="td text-[var(--muted)]">{e.note}</td><td className="td uppercase text-[var(--muted)]">{e.method}</td><td className="td text-right font-medium tabular-nums">{fmt(e.amount)}</td><td className="td text-right">{isManagerUp(user.role) && <DeleteExpense id={e.id} />}</td></tr>)}</tbody></table>
            {rows.length === 0 && <Empty>No expenses in this period.</Empty>}</section>
        </div>
        <section className="card h-fit p-4"><h3 className="mb-3 text-sm font-semibold">By category</h3><HBars rows={byCat.map((c) => ({ label: c.category, value: c.v }))} /></section>
      </div>
    </div>
  );
}
