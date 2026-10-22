"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, Phone, Plus, Printer } from "lucide-react";
import { fmt } from "@/lib/money";
import { waLink } from "@/lib/crm";
import { Modal } from "@/components/modal";
import { addLeadAction, updateLeadAction } from "../../actions/settings";

type Status = "new" | "contacted" | "meeting" | "agreement" | "won" | "lost";
type Lead = { id: number; name: string; phone: string; city: string; budget: string; message: string; status: Status; notes: string; created: string };
const COLS: { id: Status; label: string; tone: string }[] = [
  { id: "new", label: "New", tone: "border-amber-300" }, { id: "contacted", label: "Contacted", tone: "border-sky-300" }, { id: "meeting", label: "Meeting", tone: "border-violet-300" },
  { id: "agreement", label: "Agreement", tone: "border-brand-300" }, { id: "won", label: "Won", tone: "border-emerald-400" }, { id: "lost", label: "Lost", tone: "border-stone-300" },
];

export function LeadBoard({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Lead | null>(null);
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState("");
  const [f, setF] = useState({ name: "", phone: "", city: "", budget: "", message: "" });
  async function move(l: Lead, status: Status) {
    const r = await updateLeadAction(l.id, { status });
    if (!r.ok) return void toast.error(r.error);
    router.refresh();
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><button onClick={() => setAdding(true)} className="btn-ghost"><Plus size={15} /> Add lead</button></div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLS.map((col) => {
          const items = leads.filter((l) => l.status === col.id);
          return (
            <div key={col.id} className="w-64 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{col.label}<span className="text-xs font-normal text-[var(--muted)]">{items.length}</span></div>
              <div className="space-y-2">
                {items.map((l) => (
                  <div key={l.id} className={`card border-l-4 ${col.tone} p-3 text-sm`}>
                    <button onClick={() => { setOpen(l); setNotes(l.notes); }} className="w-full text-left"><div className="font-medium">{l.name}</div><div className="text-xs text-[var(--muted)]">{l.city || "—"} · {l.budget || "budget n/a"}</div></button>
                    <div className="mt-2 flex items-center gap-1.5">
                      <a href={`tel:${l.phone}`} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Call"><Phone size={14} /></a>
                      <a href={waLink(l.phone, `Hi ${l.name.split(" ")[0]}, thanks for your interest in a Misal Hub franchise! When can we talk?`)} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label="WhatsApp"><MessageCircle size={14} /></a>
                      <select value={l.status} onChange={(e) => void move(l, e.target.value as Status)} className="ml-auto rounded border border-[var(--border)] bg-white px-1 py-0.5 text-xs" aria-label={`Move ${l.name}`}>{COLS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <div className="rounded-lg border border-dashed border-stone-200 py-6 text-center text-xs text-stone-300">empty</div>}
              </div>
            </div>
          );
        })}
      </div>
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          <dl className="space-y-1 text-sm"><div><dt className="inline text-[var(--muted)]">Phone: </dt><dd className="inline">{open.phone}</dd></div><div><dt className="inline text-[var(--muted)]">City: </dt><dd className="inline">{open.city || "—"}</dd></div><div><dt className="inline text-[var(--muted)]">Budget: </dt><dd className="inline">{open.budget || "—"}</dd></div><div><dt className="inline text-[var(--muted)]">Received: </dt><dd className="inline">{open.created}</dd></div>{open.message && <div className="rounded-lg bg-stone-50 p-2">“{open.message}”</div>}</dl>
          <label className="label mt-4">Internal notes</label><textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button onClick={async () => { const r = await updateLeadAction(open.id, { notes }); if (!r.ok) return void toast.error(r.error); toast.success("Notes saved"); setOpen(null); router.refresh(); }} className="btn-primary btn-lg mt-3 w-full">Save notes</button>
        </Modal>
      )}
      {adding && (
        <Modal title="Add franchise lead" onClose={() => setAdding(false)}>
          <div className="grid grid-cols-2 gap-3">
            <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /><input className="input" placeholder="Mobile" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
            <input className="input" placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /><input className="input" placeholder="Budget" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
            <textarea className="input col-span-2" rows={2} placeholder="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          </div>
          <button onClick={async () => { const r = await addLeadAction(f); if (!r.ok) return void toast.error(r.error); toast.success("Lead added"); setAdding(false); setF({ name: "", phone: "", city: "", budget: "", message: "" }); router.refresh(); }} className="btn-primary btn-lg mt-4 w-full">Save lead</button>
        </Modal>
      )}
    </>
  );
}

export function RoyaltyPrint({ data }: { data: { outlet: string; franchisee: string; month: string; sales: number; tax: number; net: number; pct: number; royalty: number; orders: number } }) {
  return (
    <section className="card max-w-xl p-5">
      <div className="flex items-start justify-between"><div><h3 className="font-semibold">{data.outlet}</h3><p className="text-xs text-[var(--muted)]">{data.franchisee || "Franchisee"} · Royalty statement {data.month}</p></div>
        <button onClick={() => window.print()} className="btn-ghost btn-sm"><Printer size={14} /> Print</button></div>
      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex justify-between"><dt className="text-[var(--muted)]">Orders</dt><dd>{data.orders}</dd></div>
        <div className="flex justify-between"><dt className="text-[var(--muted)]">Gross sales</dt><dd>{fmt(data.sales)}</dd></div>
        <div className="flex justify-between"><dt className="text-[var(--muted)]">− GST</dt><dd>{fmt(data.tax)}</dd></div>
        <div className="flex justify-between border-t border-[var(--border)] pt-1.5 font-medium"><dt>Net sales</dt><dd>{fmt(data.net)}</dd></div>
        <div className="flex justify-between"><dt className="text-[var(--muted)]">Royalty @ {data.pct}%</dt><dd className="text-lg font-semibold">{fmt(data.royalty)}</dd></div>
      </dl>
    </section>
  );
}
