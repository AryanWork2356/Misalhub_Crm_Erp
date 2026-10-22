import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { fmtDate, fmtDateTime, businessDate } from "@/lib/dates";
import { segmentOf } from "@/lib/crm";
import { PageHeader, Stat, Tabs, Empty } from "@/components/ui";
import { HBars } from "@/components/viz";
import Campaigns, { type Target } from "./campaigns";
import CouponManager from "./coupon-manager";

export const metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireUser("marketing");
  const outletId = await currentOutletId(user);
  const tab = (await searchParams).tab ?? "campaigns";
  const db = await getDb();
  const today = businessDate();
  let body: React.ReactNode;

  if (tab === "coupons") {
    const coupons = await db.select().from(schema.coupons).orderBy(desc(schema.coupons.id));
    body = <CouponManager canEdit={isManagerUp(user.role)} coupons={coupons.map((c) => ({ id: c.id, code: c.code, description: c.description, kind: c.kind, value: c.value, minOrder: c.minOrder, maxDiscount: c.maxDiscount, validTo: c.validTo, usageLimit: c.usageLimit, used: c.used, active: c.active }))} />;
  } else if (tab === "feedback") {
    const fb = await db.select({ f: schema.feedback, name: schema.customers.name }).from(schema.feedback).leftJoin(schema.customers, eq(schema.customers.id, schema.feedback.customerId))
      .where(eq(schema.feedback.outletId, outletId)).orderBy(desc(schema.feedback.createdAt)).limit(40);
    const [agg] = await db.select({ n: sql<number>`COUNT(*)::int`, avg: sql<number>`COALESCE(AVG(rating),0)::float`, food: sql<number>`COALESCE(AVG(food_rating),0)::float`, svc: sql<number>`COALESCE(AVG(service_rating),0)::float` }).from(schema.feedback).where(eq(schema.feedback.outletId, outletId));
    const dist = await db.select({ r: schema.feedback.rating, n: sql<number>`COUNT(*)::int` }).from(schema.feedback).where(eq(schema.feedback.outletId, outletId)).groupBy(schema.feedback.rating);
    body = (
      <div>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Average rating" value={agg.n ? agg.avg.toFixed(2) + " ★" : "—"} tone={agg.avg >= 4.3 ? "good" : agg.avg && agg.avg < 3.8 ? "bad" : undefined} />
          <Stat label="Food" value={agg.food ? agg.food.toFixed(2) : "—"} /><Stat label="Service" value={agg.svc ? agg.svc.toFixed(2) : "—"} /><Stat label="Responses" value={String(agg.n)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <section className="card p-4"><h3 className="mb-3 text-sm font-semibold">Rating mix</h3>
            <HBars money={false} rows={[5, 4, 3, 2, 1].map((r) => ({ label: `${r} ★`, value: dist.find((d) => d.r === r)?.n ?? 0 }))} /></section>
          <section className="card divide-y divide-stone-100">
            {fb.map(({ f, name }) => (
              <div key={f.id} className="px-4 py-3 text-sm"><div className="flex justify-between"><span className="font-medium">{name || "Guest"} <span className={f.rating >= 4 ? "text-emerald-700" : f.rating <= 2 ? "text-red-600" : "text-amber-700"}>{"★".repeat(f.rating)}</span></span><span className="text-xs text-[var(--muted)]">{fmtDateTime(f.createdAt)}</span></div>{f.comment && <p className="mt-0.5 text-[var(--muted)]">“{f.comment}”</p>}</div>
            ))}
            {fb.length === 0 && <Empty>No feedback yet. Share your feedback link (Settings → Online ordering) with customers.</Empty>}
          </section>
        </div>
      </div>
    );
  } else {
    const customers = await db.select().from(schema.customers).where(eq(schema.customers.marketingOptIn, true));
    const md = (b: string | null) => (b ? b.slice(5) : null);
    const todayMD = today.slice(5);
    const soon = new Set(Array.from({ length: 8 }, (_, i) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(5, 10); }));
    const targets: Target[] = customers.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, segment: segmentOf(c), spent: c.totalSpent, lastVisit: c.lastVisitAt ? fmtDate(c.lastVisitAt.toISOString().slice(0, 10)) : "—",
      birthdaySoon: !!md(c.birthday) && soon.has(md(c.birthday)!), birthdayToday: md(c.birthday) === todayMD,
    }));
    body = <Campaigns targets={targets} />;
  }

  return (
    <div>
      <PageHeader title="Marketing" subtitle="Win customers back, reward regulars, and track what guests say." />
      <Tabs base="/marketing" current={tab} tabs={[{ id: "campaigns", label: "WhatsApp campaigns" }, { id: "coupons", label: "Coupons" }, { id: "feedback", label: "Feedback" }]} />
      {body}
    </div>
  );
}
