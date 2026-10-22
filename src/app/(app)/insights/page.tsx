import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { currentOutletId, requireUser } from "@/lib/auth";
import { addDays, businessDate, fmtDate } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { alerts, frequentPairs, menuEngineering, prepPlan, runOutForecast, type MenuClass } from "@/lib/insights";
import { PageHeader, Empty } from "@/components/ui";
import AskAssistant from "./ask-assistant";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const ICON = { good: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info };
const TONE = { good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600", info: "text-sky-600" };
const CLASS_INFO: Record<MenuClass, { label: string; tip: string; style: string }> = {
  star: { label: "Stars", tip: "Popular and profitable — protect and feature them.", style: "bg-emerald-50 border-emerald-200" },
  plowhorse: { label: "Workhorses", tip: "Popular but thin margin — nudge the price or trim the portion cost.", style: "bg-amber-50 border-amber-200" },
  puzzle: { label: "Hidden gems", tip: "Profitable but under-ordered — promote, rename, or position better.", style: "bg-sky-50 border-sky-200" },
  dog: { label: "Reconsider", tip: "Neither popular nor profitable — rework or retire.", style: "bg-stone-50 border-stone-200" },
};

export default async function InsightsPage() {
  const { user } = await requireUser("insights");
  const outletId = await currentOutletId(user);
  const today = businessDate();
  const s60 = { outletIds: [outletId], from: addDays(today, -59), to: today };
  const [al, plan, runout, pairs, eng] = await Promise.all([alerts(outletId), prepPlan(outletId), runOutForecast(outletId), frequentPairs(s60), menuEngineering(s60)]);
  const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <div>
      <PageHeader title="Insights" subtitle="Plain-language signals computed from your own sales, stock and feedback." />

      <section className="mb-5 grid gap-2 md:grid-cols-2">
        {al.map((a, i) => { const I = ICON[a.level]; return (
          <div key={i} className="card flex gap-3 p-3.5"><I size={20} className={`mt-0.5 shrink-0 ${TONE[a.level]}`} /><div><div className="text-sm font-semibold">{a.title}</div><p className="mt-0.5 text-sm text-[var(--muted)]">{a.detail}</p></div></div>); })}
        {al.length === 0 && <div className="card md:col-span-2"><Empty>Not enough activity yet for insights — they appear after a week of orders.</Empty></div>}
      </section>

      <AskAssistant />

      <section className="card mt-5 p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">Morning prep planner</h2><span className="text-sm text-[var(--muted)]">for {DOW[plan.dow]}, {fmtDate(plan.target)}</span></div>
        {plan.days === 0 ? <Empty>No history for this weekday yet.</Empty> : (
          <>
            <p className="mb-3 text-sm text-[var(--muted)]">Forecast = average of the last {plan.days} {DOW[plan.dow]}s. Ingredient needs come from recipes; stock on hand is compared so you can grind masala, soak matki and order in time.</p>
            <div className="grid gap-5 lg:grid-cols-2">
              <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Expected portions</h3>
                <ul className="divide-y divide-stone-100 text-sm">{plan.items.map((i) => <li key={i.id} className="flex justify-between py-1.5"><span>{i.name}</span><b className="tabular-nums">~{i.qty}</b></li>)}</ul></div>
              <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Ingredients to have ready</h3>
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-[var(--muted)]"><th className="pb-1 font-medium">Item</th><th className="pb-1 text-right font-medium">Need</th><th className="pb-1 text-right font-medium">On hand</th></tr></thead>
                  <tbody>{plan.ingredients.slice(0, 12).map((g) => { const short = g.have < g.need; return <tr key={g.id} className="border-t border-stone-100"><td className="py-1.5">{g.name}</td><td className="py-1.5 text-right tabular-nums">{+g.need.toFixed(2)} {g.unit}</td><td className={`py-1.5 text-right tabular-nums ${short ? "font-semibold text-red-600" : "text-[var(--muted)]"}`}>{+g.have.toFixed(2)}{short && " ⚠"}</td></tr>; })}</tbody></table></div>
            </div>
          </>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="card p-5"><h2 className="mb-1 font-semibold">Running out soon</h2><p className="mb-3 text-sm text-[var(--muted)]">Days of stock left at the last 14 days&apos; usage.</p>
          {runout.length === 0 ? <Empty>No consumption data yet.</Empty> : <ul className="divide-y divide-stone-100 text-sm">{runout.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span>{r.name}<span className="ml-2 text-xs text-[var(--muted)]">{+r.qty.toFixed(1)} {r.unit} · uses {+r.perDay.toFixed(2)}/day</span></span>
            <span className={`badge ${r.daysLeft < 2 ? "bg-red-100 text-red-700" : r.daysLeft < 5 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{r.daysLeft < 1 ? "< 1 day" : `${r.daysLeft.toFixed(1)} days`}</span></li>)}</ul>}</section>
        <section className="card p-5"><h2 className="mb-1 font-semibold">Bought together</h2><p className="mb-3 text-sm text-[var(--muted)]">Use these for combos and cashier upsell prompts (last 60 days).</p>
          {pairs.length === 0 ? <Empty>Not enough orders yet.</Empty> : <ul className="divide-y divide-stone-100 text-sm">{pairs.map((p, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span>{p.a} <span className="text-[var(--muted)]">+</span> {p.b}</span><span className="shrink-0 text-xs text-[var(--muted)]">{p.n} orders · {p.support.toFixed(1)}%</span></li>)}</ul>}</section>
      </div>

      <section className="mt-5">
        <h2 className="mb-1 font-semibold">Menu engineering</h2><p className="mb-3 text-sm text-[var(--muted)]">Every item sorted by how often it sells and how much each portion earns after ingredient cost (last 60 days).</p>
        {eng.length === 0 ? <div className="card"><Empty>Add recipes in Inventory to unlock menu engineering.</Empty></div> : (
          <div className="grid gap-3 md:grid-cols-2">{(Object.keys(CLASS_INFO) as MenuClass[]).map((k) => { const items = eng.filter((e) => e.cls === k).sort((a, b) => b.qty - a.qty); return (
            <div key={k} className={`rounded-xl border p-4 ${CLASS_INFO[k].style}`}><div className="flex items-baseline justify-between"><h3 className="font-semibold">{CLASS_INFO[k].label}</h3><span className="text-xs text-[var(--muted)]">{items.length} items</span></div>
              <p className="mb-2 text-xs text-[var(--muted)]">{CLASS_INFO[k].tip}</p>
              <ul className="space-y-0.5 text-sm">{items.slice(0, 7).map((i) => <li key={i.id} className="flex justify-between"><span>{i.name}</span><span className="tabular-nums text-[var(--muted)]">{i.qty} sold · {fmt(i.margin)} each</span></li>)}</ul></div>); })}</div>
        )}
      </section>
    </div>
  );
}
