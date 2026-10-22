import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isHeadOffice } from "@/lib/permissions";
import { PageHeader, Tabs } from "@/components/ui";
import { OutletForm, TableManager, AuditLog } from "./settings-client";
import { fmtDateTime } from "@/lib/dates";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; outlet?: string }> }) {
  const { user } = await requireUser("settings");
  const own = await currentOutletId(user);
  const sp = await searchParams;
  const tab = sp.tab ?? "outlet";
  const head = isHeadOffice(user.role);
  const db = await getDb();
  const outlets = await db.select().from(schema.outlets).orderBy(asc(schema.outlets.id));
  const editingId = head && Number(sp.outlet) ? Number(sp.outlet) : own;
  const outlet = outlets.find((o) => o.id === editingId) ?? outlets[0];

  let body: React.ReactNode;
  if (tab === "tables") {
    const tables = await db.select().from(schema.diningTables).where(eq(schema.diningTables.outletId, own)).orderBy(asc(schema.diningTables.section), asc(schema.diningTables.name));
    body = <TableManager outletCode={outlets.find((o) => o.id === own)?.code ?? ""} tables={tables.map((t) => ({ id: t.id, name: t.name, section: t.section, capacity: t.capacity, active: t.active }))} />;
  } else if (tab === "audit") {
    const logs = await db.select({ l: schema.auditLogs, who: schema.users.name }).from(schema.auditLogs).leftJoin(schema.users, eq(schema.users.id, schema.auditLogs.userId)).orderBy(desc(schema.auditLogs.id)).limit(150);
    body = <AuditLog rows={logs.map(({ l, who }) => ({ id: l.id, when: fmtDateTime(l.createdAt), who: who ?? "system", action: l.action, detail: l.detail }))} />;
  } else if (tab === "online") {
    const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    body = (
      <div className="space-y-4">
        <section className="card p-5 text-sm">
          <h3 className="mb-2 font-semibold">Customer-facing links for {outlet.name}</h3>
          <ul className="space-y-2">
            <li><span className="text-[var(--muted)]">Online ordering page:</span> <code className="rounded bg-stone-100 px-1.5 py-0.5">{base}/order/{outlet.code}</code></li>
            <li><span className="text-[var(--muted)]">Table QR (dine-in):</span> <code className="rounded bg-stone-100 px-1.5 py-0.5">{base}/order/{outlet.code}?table=T1</code> — change T1 for each table, print as QR from Settings → Tables.</li>
            <li><span className="text-[var(--muted)]">Franchise enquiry API (for misalhub.com form):</span> <code className="rounded bg-stone-100 px-1.5 py-0.5">POST {base}/api/public/franchise-lead</code></li>
            <li><span className="text-[var(--muted)]">Feedback page:</span> <code className="rounded bg-stone-100 px-1.5 py-0.5">{base}/feedback/&lt;order id&gt;</code> — shown after payment on QR orders and shareable on WhatsApp.</li>
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">Set NEXT_PUBLIC_APP_URL in the environment to your real domain so these links are correct.</p>
        </section>
      </div>
    );
  } else {
    body = (
      <>
        {head && outlets.length > 1 && <div className="mb-3 flex flex-wrap gap-1.5">{outlets.map((o) => <a key={o.id} href={`/settings?outlet=${o.id}`} className={`rounded-full border px-3 py-1 text-sm font-medium ${o.id === outlet.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white text-stone-600"}`}>{o.name}</a>)}<a href="/settings?outlet=new" className="rounded-full border border-dashed border-stone-300 px-3 py-1 text-sm text-stone-500">+ New outlet</a></div>}
        <OutletForm key={sp.outlet === "new" ? "new" : outlet.id} canCommercial={head} outlet={sp.outlet === "new" && head ? null : { ...outlet, royaltyPct: Number(outlet.royaltyPct) }} />
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle={outlet.name} />
      <Tabs base="/settings" current={tab} tabs={[{ id: "outlet", label: "Outlet & billing" }, { id: "tables", label: "Tables" }, { id: "online", label: "Online ordering" }, ...(head ? [{ id: "audit", label: "Audit log" }] : [])]} />
      {body}
    </div>
  );
}
