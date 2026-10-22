"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt, fmtCompact } from "@/lib/money";

// Single-series charts use one brand hue; identity is carried by the title, so no legend box is needed.
const INK = "#e04a00";
const GRID = "#ece6df";
const AXIS = "#7a6f66";

type Point = { label: string; value: number; sub?: string };

function Tip({ active, payload, label, money, unit }: { active?: boolean; payload?: { value: number; payload: Point }[]; label?: string; money: boolean; unit: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{money ? fmt(p.value) : `${p.value} ${unit}`}</div>
      {p.payload.sub && <div className="text-[var(--muted)]">{p.payload.sub}</div>}
    </div>
  );
}

export function BarsChart({ data, money = true, unit = "orders", height = 220 }: { data: Point[]; money?: boolean; unit?: string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <div role="img" aria-label={`Bar chart, peak ${money ? fmt(max) : max}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (money ? fmtCompact(v).replace("₹", "") : String(v))} />
          <Tooltip cursor={{ fill: "rgba(244,93,10,0.08)" }} content={<Tip money={money} unit={unit} />} />
          <Bar dataKey="value" fill={INK} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data, money = true, unit = "orders", height = 220 }: { data: Point[]; money?: boolean; unit?: string; height?: number }) {
  const last = data[data.length - 1];
  return (
    <div role="img" aria-label={`Trend chart over ${data.length} days${last ? `, latest ${money ? fmt(last.value) : last.value}` : ""}`} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (money ? fmtCompact(v).replace("₹", "") : String(v))} />
          <Tooltip cursor={{ stroke: GRID }} content={<Tip money={money} unit={unit} />} />
          <Line type="monotone" dataKey="value" stroke={INK} strokeWidth={2} dot={{ r: 3, fill: INK, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
