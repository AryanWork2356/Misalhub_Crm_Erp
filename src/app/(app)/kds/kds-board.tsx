"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Flame, Volume2, VolumeX, UtensilsCrossed, ShoppingBag, Bike, Users } from "lucide-react";
import { kdsItemStatusAction, kdsOrderStatusAction } from "../../actions/kitchen";

type Line = { id: number; name: string; qty: number; status: string; modifiers: string[]; notes: string; station: string; prep: number };
export type KdsTicket = { id: number; orderNo: string; type: string; channel: string; table: string | null; notes: string; createdAt: string; customerName: string; lines: Line[] };

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number }>> = { dine_in: UtensilsCrossed, takeaway: ShoppingBag, delivery: Bike, bulk: Users };

export default function KdsBoard({ tickets, station }: { tickets: KdsTicket[]; station: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(true);
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  // beep when a brand-new ticket appears
  useEffect(() => {
    const ids = new Set(tickets.map((t) => t.id));
    if (seen.current && sound && [...ids].some((id) => !seen.current!.has(id))) {
      try {
        const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + 0.25);
      } catch { /* audio blocked until first interaction */ }
    }
    seen.current = ids;
  }, [tickets, sound]);

  async function orderStatus(id: number, status: "preparing" | "ready" | "served") {
    try { await kdsOrderStatusAction(id, status, station === "all" ? undefined : station); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function itemStatus(id: number, status: "preparing" | "ready") {
    try { await kdsItemStatusAction(id, status); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-lg font-semibold">Kitchen display</h1>
        {[["all", "All"], ["main", "Main"], ["bar", "Beverages"]].map(([id, l]) => (
          <Link key={id} href={`/kds?station=${id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${station === id ? "bg-brand-500" : "bg-stone-700 hover:bg-stone-600"}`}>{l}</Link>
        ))}
        <span className="ml-auto text-sm text-stone-400">{tickets.length} active</span>
        <button onClick={() => setSound((s) => !s)} className="rounded-md bg-stone-700 p-2 hover:bg-stone-600" title="Toggle alert sound">{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
      </div>
      {tickets.length === 0 && <div className="grid h-[70vh] place-items-center text-stone-500"><div className="text-center"><Check className="mx-auto mb-2" size={40} />All caught up — no pending orders</div></div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tickets.map((t) => {
          const mins = Math.floor((now - new Date(t.createdAt).getTime()) / 60000);
          const maxPrep = Math.max(...t.lines.map((l) => l.prep));
          const late = mins > maxPrep + 3;
          const warn = mins >= maxPrep;
          const allReady = t.lines.every((l) => l.status === "ready");
          const anyStarted = t.lines.some((l) => l.status !== "pending");
          const Icon = TYPE_ICON[t.type] ?? UtensilsCrossed;
          return (
            <div key={t.id} className={`flex flex-col overflow-hidden rounded-xl border-2 ${late ? "border-red-500" : warn ? "border-amber-400" : "border-stone-700"} bg-stone-800`}>
              <div className={`flex items-center justify-between px-3 py-2 ${late ? "bg-red-600" : warn ? "bg-amber-500 text-black" : "bg-stone-700"}`}>
                <div className="flex items-center gap-2 font-semibold"><Icon size={16} /> #{t.orderNo}{t.table ? ` · ${t.table}` : t.customerName ? ` · ${t.customerName}` : ""}</div>
                <div className="flex items-center gap-1 text-sm font-semibold">{late && <Flame size={14} />}{mins}m</div>
              </div>
              <div className="flex-1 space-y-1 p-3">
                {t.channel !== "pos" && <div className="mb-1 inline-block rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{t.channel}</div>}
                {t.lines.map((l) => (
                  <div key={l.id} className="flex items-start gap-2">
                    <button onClick={() => void itemStatus(l.id, l.status === "pending" ? "preparing" : "ready")} disabled={l.status === "ready"}
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs ${l.status === "ready" ? "border-emerald-500 bg-emerald-500 text-white" : l.status === "preparing" ? "border-blue-400 bg-blue-500/20 text-blue-300" : "border-stone-500"}`}
                      title={l.status === "pending" ? "Start" : l.status === "preparing" ? "Mark ready" : "Ready"}>{l.status === "ready" ? <Check size={14} /> : l.status === "preparing" ? "…" : ""}</button>
                    <div className={`min-w-0 flex-1 ${l.status === "ready" ? "text-stone-500 line-through" : ""}`}>
                      <div className="text-[15px] font-semibold leading-tight"><span className="mr-1 text-brand-400">{l.qty}×</span>{l.name}</div>
                      {l.modifiers.length > 0 && <div className="text-sm text-amber-300">{l.modifiers.join(" · ")}</div>}
                      {l.notes && <div className="text-sm italic text-sky-300">“{l.notes}”</div>}
                    </div>
                  </div>
                ))}
                {t.notes && <div className="mt-2 rounded bg-stone-700 px-2 py-1 text-sm">📝 {t.notes}</div>}
              </div>
              <div className="grid grid-cols-2 gap-2 p-2">
                {!anyStarted
                  ? <button onClick={() => void orderStatus(t.id, "preparing")} className="col-span-2 rounded-lg bg-blue-600 py-2.5 font-semibold hover:bg-blue-500">Start cooking</button>
                  : <>
                    <button onClick={() => void orderStatus(t.id, "ready")} className="rounded-lg bg-emerald-600 py-2.5 font-semibold hover:bg-emerald-500">{allReady ? "✓ Ready" : "All ready"}</button>
                    <button onClick={() => void orderStatus(t.id, "served")} className="rounded-lg bg-stone-600 py-2.5 font-semibold hover:bg-stone-500">Bump</button>
                  </>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
