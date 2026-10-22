import Link from "next/link";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="kpi">
      <div className="text-xs font-medium text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-sm text-[var(--muted)]">{children}</div>;
}

export function Tabs({ tabs, current, base, extra }: { tabs: { id: string; label: string }[]; current: string; base: string; extra?: Record<string, string> }) {
  const keep = Object.entries(extra ?? {}).filter(([, v]) => v);
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-stone-100 p-1 text-sm font-medium">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}?${new URLSearchParams([["tab", t.id], ...keep]).toString()}`} scroll={false}
          className={`shrink-0 rounded-md px-3.5 py-1.5 transition ${current === t.id ? "bg-white shadow-sm text-ink" : "text-stone-500 hover:text-ink"}`}>{t.label}</Link>
      ))}
    </div>
  );
}

const STATUS: Record<string, string> = {
  new: "bg-amber-100 text-amber-800", preparing: "bg-blue-100 text-blue-800", ready: "bg-emerald-100 text-emerald-800",
  served: "bg-stone-200 text-stone-700", out_for_delivery: "bg-violet-100 text-violet-800", completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-700", paid: "bg-emerald-100 text-emerald-800", partial: "bg-amber-100 text-amber-800", unpaid: "bg-red-100 text-red-700", refunded: "bg-stone-200 text-stone-700",
};
export const StatusBadge = ({ s }: { s: string }) => <span className={`badge ${STATUS[s] ?? "bg-stone-100 text-stone-700"}`}>{s.replace(/_/g, " ")}</span>;

export const TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", bulk: "Bulk" };
export const CHANNEL_LABEL: Record<string, string> = { pos: "POS", website: "Website", whatsapp: "WhatsApp", qr: "QR table", swiggy: "Swiggy", zomato: "Zomato", phone: "Phone" };
