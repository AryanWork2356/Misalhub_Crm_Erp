"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Phone, CheckCircle2, Navigation, MessageCircle } from "lucide-react";
import { assignDeliveryAction, collectDeliveryPaymentAction, markDeliveredAction } from "../../actions/orders";
import { fmt } from "@/lib/money";
import { minutesAgo } from "@/lib/dates";
import { StatusBadge } from "@/components/ui";

export type DeliveryOrder = { id: number; orderNo: string; status: string; customerName: string; phone: string; address: string; total: number; paid: number; partnerId: number | null; createdAt: string; items: string[] };

export default function DeliveryBoard({ orders, partners, canAssign }: { orders: DeliveryOrder[]; partners: { id: number; name: string }[]; canAssign: boolean }) {
  const router = useRouter();
  async function call<T extends { ok: boolean }>(p: Promise<T>, msg: string) {
    const r = await p as unknown as { ok: boolean; error?: string };
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    toast.success(msg); router.refresh();
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => {
        const due = o.total - o.paid;
        return (
          <div key={o.id} className="card p-4 text-sm">
            <div className="flex items-center justify-between"><span className="font-semibold">#{o.orderNo} · {o.customerName || "Customer"}</span><StatusBadge s={o.status} /></div>
            <div className="mt-1 text-xs text-[var(--muted)]">{minutesAgo(o.createdAt)} min ago</div>
            <div className="mt-2 flex items-start gap-1.5"><MapPin size={14} className="mt-0.5 shrink-0 text-stone-400" />{o.address || "No address"}</div>
            {o.phone && <a href={`tel:${o.phone}`} className="mt-1 flex items-center gap-1.5 text-brand-700"><Phone size={14} /> {o.phone}</a>}
            <div className="mt-2 text-xs text-[var(--muted)]">{o.items.join(" · ")}</div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-1.5">
              <span>{due > 0 ? "To collect" : "Paid online"}</span><b className={due > 0 ? "text-red-600" : "text-emerald-700"}>{due > 0 ? fmt(due) : "✓"}</b>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {canAssign && (
                <select value={o.partnerId ?? ""} onChange={(e) => call(assignDeliveryAction(o.id, e.target.value ? Number(e.target.value) : null), "Rider assigned")} className="input w-auto flex-1">
                  <option value="">Assign rider…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {o.address && <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.address)}`}><Navigation size={13} /> Map</a>}
              {o.phone && <a className="btn-ghost btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/91${o.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hi ${o.customerName || ""}, your Misal Hub order #${o.orderNo} is on the way!`)}`}><MessageCircle size={13} /> WhatsApp</a>}
            </div>
            {o.status === "out_for_delivery" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {due > 0
                  ? <><button onClick={() => call(collectDeliveryPaymentAction(o.id, "cash"), "Delivered · cash collected")} className="btn-primary btn-sm"><CheckCircle2 size={14} /> Cash collected</button>
                      <button onClick={() => call(collectDeliveryPaymentAction(o.id, "upi"), "Delivered · UPI collected")} className="btn-dark btn-sm">UPI collected</button></>
                  : <button onClick={() => call(markDeliveredAction(o.id), "Delivered")} className="btn-primary btn-sm col-span-2"><CheckCircle2 size={14} /> Mark delivered</button>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
