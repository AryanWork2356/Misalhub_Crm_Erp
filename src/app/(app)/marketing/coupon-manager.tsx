"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { fmt } from "@/lib/money";
import { Modal } from "@/components/modal";
import { saveCouponAction } from "../../actions/crm";

type Coupon = { id: number; code: string; description: string; kind: "percent" | "flat"; value: number; minOrder: number; maxDiscount: number | null; validTo: string | null; usageLimit: number | null; used: number; active: boolean };

export default function CouponManager({ coupons, canEdit }: { coupons: Coupon[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", description: "", kind: "percent" as "percent" | "flat", value: "10", minOrder: "0", maxDiscount: "", validTo: "", usageLimit: "" });

  async function toggle(c: Coupon) {
    const r = await saveCouponAction({ ...c, active: !c.active });
    if (!r.ok) return void toast.error(r.error);
    router.refresh();
  }
  return (
    <>
      {canEdit && <div className="mb-3 flex justify-end"><button onClick={() => setOpen(true)} className="btn-primary"><Plus size={15} /> New coupon</button></div>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Code</th><th className="th">Offer</th><th className="th">Conditions</th><th className="th text-right">Used</th><th className="th">Status</th></tr></thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} className="border-b border-stone-100 last:border-0">
                <td className="td"><div className="font-mono font-semibold">{c.code}</div><div className="text-xs text-[var(--muted)]">{c.description}</div></td>
                <td className="td">{c.kind === "percent" ? `${c.value}% off` : `${fmt(c.value)} off`}{c.maxDiscount != null && <span className="text-xs text-[var(--muted)]"> (max {fmt(c.maxDiscount)})</span>}</td>
                <td className="td text-xs text-[var(--muted)]">{c.minOrder ? `Min ${fmt(c.minOrder)}` : "No minimum"}{c.validTo && ` · until ${c.validTo}`}{c.usageLimit && ` · limit ${c.usageLimit}`}</td>
                <td className="td text-right tabular-nums">{c.used}</td>
                <td className="td"><button disabled={!canEdit} onClick={() => toggle(c)} className={`badge ${c.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{c.active ? "Active" : "Paused"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <Modal title="New coupon" onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Code</label><input className="input uppercase" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="DIWALI15" autoFocus /></div>
            <div className="col-span-2"><label className="label">Description</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
            <div><label className="label">Type</label><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "percent" | "flat" })}><option value="percent">Percent</option><option value="flat">Flat ₹</option></select></div>
            <div><label className="label">{f.kind === "percent" ? "Percent" : "Amount (₹)"}</label><input type="number" className="input" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></div>
            <div><label className="label">Min order (₹)</label><input type="number" className="input" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} /></div>
            <div><label className="label">Max discount (₹)</label><input type="number" className="input" value={f.maxDiscount} onChange={(e) => setF({ ...f, maxDiscount: e.target.value })} placeholder="optional" /></div>
            <div><label className="label">Valid until</label><input type="date" className="input" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} /></div>
            <div><label className="label">Usage limit</label><input type="number" className="input" value={f.usageLimit} onChange={(e) => setF({ ...f, usageLimit: e.target.value })} placeholder="optional" /></div>
          </div>
          <button onClick={async () => {
            const r = await saveCouponAction({ code: f.code, description: f.description, kind: f.kind, value: f.kind === "flat" ? Math.round(Number(f.value) * 100) : Math.round(Number(f.value)), minOrder: Math.round(Number(f.minOrder || 0) * 100), maxDiscount: f.maxDiscount ? Math.round(Number(f.maxDiscount) * 100) : null, validTo: f.validTo || null, usageLimit: f.usageLimit ? Number(f.usageLimit) : null, active: true });
            if (!r.ok) return void toast.error(r.error.includes("unique") ? "That code already exists" : r.error);
            toast.success("Coupon created"); setOpen(false); router.refresh();
          }} className="btn-primary btn-lg mt-4 w-full">Create coupon</button>
        </Modal>
      )}
    </>
  );
}
