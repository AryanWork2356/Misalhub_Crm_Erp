import { fmt } from "@/lib/money";

/** Horizontal ranked bars (single hue, direct value labels). Server-safe, no JS. */
export function HBars({ rows, money = true, unit = "" }: { rows: { label: string; value: number; sub?: string }[]; money?: boolean; unit?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-6 text-center text-sm text-[var(--muted)]">No data yet.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums">{money ? fmt(r.value) : `${r.value}${unit}`}{r.sub && <span className="ml-1.5 text-xs text-[var(--muted)]">{r.sub}</span>}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-stone-100" role="presentation">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday × hour intensity grid (one hue, light→dark) with a numeric tooltip on each cell. */
export function Heatmap({ cells, hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] }: { cells: { dow: number; h: number; n: number }[]; hours?: number[] }) {
  const max = Math.max(...cells.map((c) => c.n), 1);
  const get = (d: number, h: number) => cells.find((c) => c.dow === d && c.h === h)?.n ?? 0;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[520px]">
        <div className="mb-1 ml-10 grid text-[10px] text-[var(--muted)]" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
          {hours.map((h) => <span key={h} className="text-center">{h % 12 || 12}{h < 12 ? "a" : "p"}</span>)}
        </div>
        {DAYS.map((d, di) => (
          <div key={d} className="mb-0.5 flex items-center gap-1">
            <span className="w-9 text-xs text-[var(--muted)]">{d}</span>
            <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
              {hours.map((h) => {
                const n = get(di, h);
                const a = n === 0 ? 0 : 0.12 + (n / max) * 0.88;
                return <div key={h} title={`${d} ${h % 12 || 12}${h < 12 ? "am" : "pm"}: ${n} orders`} className="h-6 rounded-[3px] bg-stone-100" style={n ? { backgroundColor: `rgba(224,74,0,${a})` } : undefined} />;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="text-xs text-[var(--muted)]">no comparison</span>;
  const pct = ((now - prev) / prev) * 100;
  const up = pct >= 0;
  return <span className={`text-xs font-medium ${up ? "text-emerald-700" : "text-red-600"}`}>{up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs prev</span>;
}
