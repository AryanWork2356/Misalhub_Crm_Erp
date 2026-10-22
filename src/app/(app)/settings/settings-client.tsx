"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Printer, QrCode } from "lucide-react";
import { Modal } from "@/components/modal";
import { addTableAction, saveOutletAction, toggleTableAction } from "../../actions/settings";

type Outlet = {
  id: number; code: string; name: string; address: string; phone: string; gstin: string; fssai: string; upiId: string; isFranchise: boolean; franchiseeName: string; royaltyPct: number;
  openTime: string; closeTime: string; deliveryRadiusKm: number; deliveryFeeNear: number; deliveryFeeFar: number; billFooter: string; taxInclusive: boolean; gstOn: boolean; loyaltyEnabled: boolean; loyaltyEarnPct: number; active: boolean;
};

const BLANK: Omit<Outlet, "id"> = { code: "", name: "", address: "", phone: "", gstin: "", fssai: "", upiId: "", isFranchise: true, franchiseeName: "", royaltyPct: 5, openTime: "08:00", closeTime: "20:00", deliveryRadiusKm: 5, deliveryFeeNear: 5000, deliveryFeeFar: 8000, billFooter: "Thank you, visit again!", taxInclusive: true, gstOn: true, loyaltyEnabled: true, loyaltyEarnPct: 5, active: true };

export function OutletForm({ outlet, canCommercial }: { outlet: Outlet | null; canCommercial: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<Omit<Outlet, "id">>(outlet ?? BLANK);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const T = ({ k, label, ...rest }: { k: keyof typeof f; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div><label className="label">{label}</label><input className="input" value={String(f[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} {...rest} /></div>
  );
  const C = ({ k, label, hint }: { k: "taxInclusive" | "gstOn" | "loyaltyEnabled" | "active" | "isFranchise"; label: string; hint?: string }) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" /><span>{label}{hint && <span className="block text-xs text-[var(--muted)]">{hint}</span>}</span></label>
  );
  return (
    <div className="grid max-w-4xl gap-4">
      <section className="card grid gap-3 p-5 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Outlet details</h3>
        <T k="name" label="Outlet name" /><T k="code" label="Code (used in order links)" disabled={!!outlet && !canCommercial} />
        <div className="sm:col-span-2"><T k="address" label="Address (printed on bills)" /></div>
        <T k="phone" label="Phone" /><T k="gstin" label="GSTIN" placeholder="27ABCDE1234F1Z5" /><T k="fssai" label="FSSAI licence no." /><T k="upiId" label="UPI ID (shows QR at payment)" placeholder="misalhub@upi" />
        <T k="openTime" label="Opens" type="time" /><T k="closeTime" label="Closes" type="time" />
      </section>
      <section className="card grid gap-3 p-5 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Billing & tax</h3>
        <C k="gstOn" label="Charge GST on bills" /><C k="taxInclusive" label="Menu prices include GST" hint="On: GST is shown as a breakup inside the price. Off: GST is added on top." />
        <div className="sm:col-span-2"><T k="billFooter" label="Bill footer message" /></div>
        <C k="loyaltyEnabled" label="Loyalty points enabled" />
        <div><label className="label">Points earned (% of bill)</label><input type="number" min={0} max={50} className="input" value={f.loyaltyEarnPct} onChange={(e) => set("loyaltyEarnPct", Number(e.target.value))} /></div>
      </section>
      <section className="card grid gap-3 p-5 sm:grid-cols-3">
        <h3 className="font-semibold sm:col-span-3">Delivery</h3>
        <div><label className="label">Radius (km)</label><input type="number" className="input" value={f.deliveryRadiusKm} onChange={(e) => set("deliveryRadiusKm", Number(e.target.value))} /></div>
        <div><label className="label">Fee ≤ 1 km (₹)</label><input type="number" className="input" value={f.deliveryFeeNear / 100} onChange={(e) => set("deliveryFeeNear", Math.round(Number(e.target.value) * 100))} /></div>
        <div><label className="label">Fee beyond (₹)</label><input type="number" className="input" value={f.deliveryFeeFar / 100} onChange={(e) => set("deliveryFeeFar", Math.round(Number(e.target.value) * 100))} /></div>
      </section>
      {canCommercial && (
        <section className="card grid gap-3 p-5 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Franchise terms (head office only)</h3>
          <C k="isFranchise" label="This is a franchise outlet" /><C k="active" label="Outlet is active" />
          <T k="franchiseeName" label="Franchisee name" />
          <div><label className="label">Royalty (% of net sales)</label><input type="number" min={0} max={50} step="0.5" className="input" value={f.royaltyPct} onChange={(e) => set("royaltyPct", Number(e.target.value))} /></div>
        </section>
      )}
      <div><button disabled={saving} onClick={async () => {
        setSaving(true);
        const r = await saveOutletAction({ ...f, id: outlet?.id, royaltyPct: Number(f.royaltyPct), deliveryRadiusKm: Number(f.deliveryRadiusKm) });
        setSaving(false);
        if (!r.ok) return void toast.error(r.error.includes("unique") ? "That outlet code is already used" : r.error);
        toast.success("Settings saved"); router.refresh();
      }} className="btn-primary btn-lg">{saving ? "Saving…" : outlet ? "Save changes" : "Create outlet"}</button></div>
    </div>
  );
}

export function TableManager({ tables, outletCode }: { outletCode: string; tables: { id: number; name: string; section: string; capacity: number; active: boolean }[] }) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", section: "Dining", capacity: "4" });
  const [qr, setQr] = useState<{ name: string; src: string; url: string } | null>(null);
  async function showQr(name: string) {
    const url = `${window.location.origin}/order/${outletCode}?table=${encodeURIComponent(name)}`;
    setQr({ name, url, src: await QRCode.toDataURL(url, { margin: 1, width: 280 }) });
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="card overflow-x-auto"><table className="w-full">
        <thead className="border-b border-[var(--border)]"><tr><th className="th">Table</th><th className="th">Section</th><th className="th text-right">Seats</th><th className="th">Status</th><th className="th" /></tr></thead>
        <tbody>{tables.map((t) => <tr key={t.id} className="border-b border-stone-100 last:border-0"><td className="td font-medium">{t.name}</td><td className="td text-[var(--muted)]">{t.section}</td><td className="td text-right">{t.capacity}</td>
          <td className="td"><button onClick={async () => { const r = await toggleTableAction(t.id, !t.active); if (r.ok) router.refresh(); else toast.error(r.error); }} className={`badge ${t.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>{t.active ? "Active" : "Disabled"}</button></td>
          <td className="td text-right"><button onClick={() => void showQr(t.name)} className="btn-ghost btn-sm"><QrCode size={13} /> QR</button></td></tr>)}</tbody></table></div>
      <section className="card h-fit p-4"><h3 className="mb-3 font-semibold">Add table</h3>
        <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Name (T9)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /><input className="input" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} aria-label="Seats" /><input className="input col-span-2" placeholder="Section" value={f.section} onChange={(e) => setF({ ...f, section: e.target.value })} /></div>
        <button disabled={!f.name.trim()} onClick={async () => { const r = await addTableAction(f.name, f.section, Number(f.capacity)); if (!r.ok) return void toast.error(r.error.includes("unique") ? "Table name already exists" : r.error); setF({ ...f, name: "" }); router.refresh(); }} className="btn-dark mt-3 w-full">Add table</button></section>
      {qr && <Modal title={`Table ${qr.name} · QR ordering`} onClose={() => setQr(null)}>
        <div id="print-area" className="text-center"><div className="mb-1 text-lg font-bold">Table {qr.name}</div><div className="mb-2 text-sm">Scan to order · Misal Hub</div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr.src} alt={`QR for table ${qr.name}`} className="mx-auto" width={240} height={240} /><div className="mt-2 break-all text-[10px] text-stone-500">{qr.url}</div></div>
        <button onClick={() => window.print()} className="btn-primary mt-4 w-full"><Printer size={15} /> Print</button></Modal>}
    </div>
  );
}

export function AuditLog({ rows }: { rows: { id: number; when: string; who: string; action: string; detail: string }[] }) {
  return (
    <div className="card overflow-x-auto"><table className="w-full min-w-[600px]">
      <thead className="border-b border-[var(--border)]"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Action</th><th className="th">Detail</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-stone-100 last:border-0"><td className="td whitespace-nowrap text-[var(--muted)]">{r.when}</td><td className="td">{r.who}</td><td className="td"><span className="badge bg-stone-100 text-stone-700">{r.action.replace(/_/g, " ")}</span></td><td className="td text-[var(--muted)]">{r.detail}</td></tr>)}</tbody></table>
      {rows.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">No audit events yet.</p>}</div>
  );
}
