"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Check, X } from "lucide-react";
import { acceptOnlineOrderAction, rejectOnlineOrderAction } from "../../actions/orders";
import { fmt } from "@/lib/money";
import { minutesAgo } from "@/lib/dates";
import { CHANNEL_LABEL, TYPE_LABEL } from "@/components/ui";

type Inc = { id: number; orderNo: string; channel: string; type: string; customerName: string; customerPhone: string; address: string; total: number; notes: string; createdAt: string; lines: { name: string; qty: number; mods: string }[] };

export default function IncomingOrders({ orders }: { orders: Inc[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  async function act(id: number, kind: "accept" | "reject") {
    setBusy(id);
    const r = kind === "accept" ? await acceptOnlineOrderAction(id) : await rejectOnlineOrderAction(id, "Rejected by outlet");
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(kind === "accept" ? "Accepted — sent to kitchen" : "Order rejected");
    router.refresh();
  }
  return (
    <div className="mb-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold text-amber-900"><BellRing size={18} className="animate-pulse" /> {orders.length} incoming online order{orders.length > 1 ? "s" : ""} waiting</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => (
          <div key={o.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
            <div className="flex items-center justify-between font-semibold"><span>#{o.orderNo} · {CHANNEL_LABEL[o.channel]} · {TYPE_LABEL[o.type]}</span><span>{fmt(o.total)}</span></div>
            <div className="text-xs text-[var(--muted)]">{o.customerName} {o.customerPhone} · {minutesAgo(o.createdAt)}m ago</div>
            {o.address && <div className="mt-1 text-xs">📍 {o.address}</div>}
            <ul className="mt-2 space-y-0.5">{o.lines.map((l, i) => <li key={i}>{l.qty} × {l.name} {l.mods && <span className="text-xs text-[var(--muted)]">({l.mods})</span>}</li>)}</ul>
            {o.notes && <div className="mt-1 text-xs italic">“{o.notes}”</div>}
            <div className="mt-3 flex gap-2">
              <button disabled={busy === o.id} onClick={() => act(o.id, "accept")} className="btn-primary btn-sm flex-1"><Check size={14} /> Accept</button>
              <button disabled={busy === o.id} onClick={() => act(o.id, "reject")} className="btn-ghost btn-sm text-red-600"><X size={14} /> Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
