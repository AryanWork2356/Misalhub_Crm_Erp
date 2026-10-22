import { and, asc, eq, gte, inArray, lte, or, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isHeadOffice, ROLE_LABEL } from "@/lib/permissions";
import { businessDate, fmtTime } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { PageHeader, Tabs, Empty } from "@/components/ui";
import { TeamManager, AttendanceGrid } from "./staff-client";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string }> }) {
  const { user } = await requireUser("staff");
  const outletId = await currentOutletId(user);
  const sp = await searchParams;
  const tab = sp.tab ?? "team";
  const today = businessDate();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const db = await getDb();

  const head = isHeadOffice(user.role);
  const outlets = await db.select({ id: schema.outlets.id, name: schema.outlets.name }).from(schema.outlets).orderBy(schema.outlets.id);
  const staff = await db.select().from(schema.users)
    .where(head ? or(eq(schema.users.outletId, outletId), isNull(schema.users.outletId)) : eq(schema.users.outletId, outletId)).orderBy(asc(schema.users.role), asc(schema.users.name));

  let body: React.ReactNode;
  if (tab === "team") {
    body = <TeamManager actorRole={user.role} defaultOutletId={outletId} outlets={head ? outlets : outlets.filter((o) => o.id === outletId)}
      staff={staff.map((s) => ({ id: s.id, name: s.name, phone: s.phone, role: s.role, outletId: s.outletId, salary: s.monthlySalary, active: s.active, lastLogin: s.lastLoginAt ? s.lastLoginAt.toISOString() : null }))} />;
  } else {
    const [y, m] = month.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const from = `${month}-01`; const to = `${month}-${String(dim).padStart(2, "0")}`;
    const crew = staff.filter((s) => s.outletId && s.active);
    const att = crew.length ? await db.select().from(schema.attendance).where(and(inArray(schema.attendance.userId, crew.map((c) => c.id)), gte(schema.attendance.workDate, from), lte(schema.attendance.workDate, to))) : [];
    if (tab === "attendance") {
      const todayRows = att.filter((a) => a.workDate === today);
      body = (
        <>
          <div className="card mb-4 p-4"><h3 className="mb-2 text-sm font-semibold">Today</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{crew.map((c) => { const a = todayRows.find((r) => r.userId === c.id); return (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm"><span><b>{c.name}</b> <span className="text-xs text-[var(--muted)]">{ROLE_LABEL[c.role]}</span></span>
                <span className={`badge ${a?.clockIn ? (a.clockOut ? "bg-stone-200 text-stone-700" : "bg-emerald-100 text-emerald-800") : "bg-red-100 text-red-700"}`}>{a?.clockIn ? `${fmtTime(a.clockIn)}${a.clockOut ? ` – ${fmtTime(a.clockOut)}` : ""}` : a ? a.status : "absent"}</span></div>); })}</div>
            {crew.length === 0 && <Empty>No staff assigned to this outlet.</Empty>}</div>
          <AttendanceGrid month={month} days={dim} today={today} crew={crew.map((c) => ({ id: c.id, name: c.name }))} rows={att.map((a) => ({ userId: a.userId, date: a.workDate, status: a.status }))} />
        </>
      );
    } else {
      const pay = crew.map((c) => {
        const mine = att.filter((a) => a.userId === c.id);
        const days = mine.reduce((s, a) => s + (a.status === "present" || a.status === "leave" ? 1 : a.status === "half_day" ? 0.5 : 0), 0);
        return { c, days, net: Math.round((c.monthlySalary * Math.min(days, dim)) / dim) };
      });
      body = (
        <div className="card overflow-x-auto"><table className="w-full min-w-[560px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Staff</th><th className="th">Role</th><th className="th text-right">Monthly salary</th><th className="th text-right">Paid days</th><th className="th text-right">Payable</th></tr></thead>
          <tbody>{pay.map(({ c, days, net }) => <tr key={c.id} className="border-b border-stone-100 last:border-0"><td className="td font-medium">{c.name}</td><td className="td text-[var(--muted)]">{ROLE_LABEL[c.role]}</td><td className="td text-right tabular-nums">{fmt(c.monthlySalary)}</td><td className="td text-right tabular-nums">{days} / {dim}</td><td className="td text-right font-semibold tabular-nums">{fmt(net)}</td></tr>)}
            <tr className="bg-stone-50 font-semibold"><td className="td" colSpan={4}>Total payable for {month}</td><td className="td text-right tabular-nums">{fmt(pay.reduce((s, p) => s + p.net, 0))}</td></tr></tbody></table>
          <p className="px-4 py-3 text-xs text-[var(--muted)]">Payable = salary × paid days ÷ days in month. Present and leave count as full days, half-day as 0.5. Record the payment under Expenses → Salary.</p></div>
      );
    }
  }

  return (
    <div>
      <PageHeader title="Staff" subtitle="Team, roles, attendance and payroll">
        {tab !== "team" && <form className="flex items-center gap-2"><input type="hidden" name="tab" value={tab} /><input type="month" name="month" defaultValue={month} className="input w-auto py-1" aria-label="Month" /><button className="btn-dark btn-sm">Go</button></form>}
      </PageHeader>
      <Tabs base="/staff" extra={{ month: sp.month ?? "" }} current={tab} tabs={[{ id: "team", label: "Team" }, { id: "attendance", label: "Attendance" }, { id: "payroll", label: "Payroll" }]} />
      {body}
    </div>
  );
}
