"use client";

import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { Bike, CheckCircle2, Loader2, Minus, Plus, ShoppingBag, Store, UtensilsCrossed, X } from "lucide-react";
import { fmt } from "@/lib/money";

type Mod = { id: number; name: string; price: number; isDefault: boolean };
type Group = { id: number; name: string; min: number; max: number; mods: Mod[] };
type Item = { id: number; name: string; description: string; price: number; best: boolean; groups: Group[] };
export type PublicMenu = {
  outlet: { code: string; name: string; address: string; phone: string; open: string; close: string; feeNear: number; feeFar: number; radius: number };
  table: string | null;
  categories: { id: number; name: string; items: Item[] }[];
};
type Line = { key: string; item: Item; modIds: number[]; modNames: string[]; unit: number; qty: number };

export default function OrderClient({ menu }: { menu: PublicMenu }) {
  const dineIn = !!menu.table;
  const [mode, setMode] = useState<"takeaway" | "delivery">("takeaway");
  const [cat, setCat] = useState(menu.categories[0]?.id ?? 0);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState<Item | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", address: "", distance: "near" as "near" | "far", notes: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ orderNo: string; total: number; upiId: string | null; qr: string } | null>(null);

  const fee = !dineIn && mode === "delivery" ? (f.distance === "far" ? menu.outlet.feeFar : menu.outlet.feeNear) : 0;
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const items = useMemo(() => menu.categories.find((c) => c.id === cat)?.items ?? [], [menu.categories, cat]);

  function add(item: Item, modIds: number[]) {
    const mods = item.groups.flatMap((g) => g.mods).filter((m) => modIds.includes(m.id));
    const unit = item.price + mods.reduce((s, m) => s + m.price, 0);
    const key = `${item.id}:${[...modIds].sort().join(",")}`;
    setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: Math.min(l.qty + 1, 20) } : l)) : [...ls, { key, item, modIds, modNames: mods.map((m) => m.name), unit, qty: 1 }]));
  }
  const bump = (key: string, d: number) => setLines((ls) => ls.flatMap((l) => (l.key !== key ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(l.qty + d, 20) }])));

  async function place() {
    setError("");
    if (f.name.trim().length < 2) return setError("Please enter your name");
    if (f.phone.replace(/\D/g, "").length < 10) return setError("Please enter a 10-digit mobile number");
    if (!dineIn && mode === "delivery" && !f.address.trim()) return setError("Please enter your delivery address");
    setBusy(true);
    try {
      const res = await fetch("/api/public/order", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outlet: menu.outlet.code, type: dineIn ? "dine_in" : mode, table: menu.table ?? undefined, name: f.name, phone: f.phone, address: f.address, distance: f.distance, notes: f.notes, website: f.website,
          items: lines.map((l) => ({ itemId: l.item.id, qty: l.qty, modifierIds: l.modIds })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not place order");
      let qr = "";
      if (data.upiId) qr = await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(data.outletName)}&am=${(data.total / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + data.orderNo)}`, { margin: 1, width: 220 });
      setDone({ orderNo: data.orderNo, total: data.total, upiId: data.upiId, qr });
      setLines([]); setCartOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="text-emerald-600" size={56} />
        <h1 className="mt-3 text-2xl font-semibold">Order placed!</h1>
        <p className="mt-1 text-[var(--muted)]">Your order number is <b className="text-ink">#{done.orderNo}</b>. {dineIn ? "It will be brought to your table." : mode === "delivery" ? "We will confirm on WhatsApp and deliver shortly." : "We'll have it ready for pickup."}</p>
        <div className="mt-5 w-full rounded-xl border border-[var(--border)] bg-white p-4"><div className="text-sm text-[var(--muted)]">Amount to pay</div><div className="text-3xl font-semibold">{fmt(done.total)}</div>
          {done.qr ? <><img src={done.qr} alt="UPI QR code" width={180} height={180} className="mx-auto mt-3" /><p className="text-xs text-[var(--muted)]">Scan with any UPI app to pay {done.upiId}</p></> : <p className="mt-2 text-sm text-[var(--muted)]">Please pay at the counter{mode === "delivery" && !dineIn ? " or to the delivery partner" : ""}.</p>}</div>
        <button onClick={() => setDone(null)} className="btn-primary btn-lg mt-6 w-full">Order something else</button>
        <p className="mt-6 text-xs text-[var(--muted)]">Questions? Call {menu.outlet.phone}</p>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-28">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-xl">🍲</div>
          <div className="min-w-0 flex-1"><h1 className="truncate font-semibold leading-tight">{menu.outlet.name}</h1><p className="text-xs text-[var(--muted)]">{dineIn ? `Table ${menu.table} · scan & order` : `Open ${menu.outlet.open}–${menu.outlet.close}`}</p></div></div>
        {!dineIn && (
          <div className="mt-3 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm font-medium">
            {([["takeaway", "Pickup", Store], ["delivery", "Delivery", Bike]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setMode(id)} className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 ${mode === id ? "bg-white shadow-sm" : "text-stone-500"}`}><Icon size={15} /> {label}</button>))}
          </div>)}
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">{menu.categories.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${cat === c.id ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--border)] bg-white"}`}>{c.name}</button>)}</div>
      </header>

      <ul className="divide-y divide-stone-100 px-4">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 py-3.5">
            <div className="min-w-0 flex-1"><div className="font-medium">{i.name} {i.best && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">BESTSELLER</span>}</div>
              {i.description && <p className="mt-0.5 text-sm text-[var(--muted)]">{i.description}</p>}<div className="mt-1 font-semibold text-brand-700">{fmt(i.price)}</div></div>
            <button onClick={() => (i.groups.length ? setPick(i) : add(i, []))} className="btn-ghost shrink-0 border-brand-300 text-brand-700" aria-label={`Add ${i.name}`}><Plus size={15} /> Add</button>
          </li>))}
      </ul>

      {count > 0 && <button onClick={() => setCartOpen(true)} className="btn-primary btn-lg fixed inset-x-4 bottom-4 z-30 mx-auto max-w-2xl justify-between shadow-xl"><span className="flex items-center gap-2"><ShoppingBag size={18} /> {count} item{count > 1 ? "s" : ""}</span><span>View cart · {fmt(subtotal)}</span></button>}

      {pick && <CustomiseSheet item={pick} onClose={() => setPick(null)} onAdd={(ids) => { add(pick, ids); setPick(null); }} />}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 sm:items-center sm:justify-center" onMouseDown={(e) => e.target === e.currentTarget && setCartOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Your order" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Your order</h2><button onClick={() => setCartOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-stone-100"><X size={18} /></button></div>
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-3 border-b border-stone-100 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="font-medium">{l.item.name}</div>{l.modNames.length > 0 && <div className="text-xs text-[var(--muted)]">{l.modNames.join(", ")}</div>}</div>
                <div className="flex items-center rounded-lg border border-[var(--border)]"><button onClick={() => bump(l.key, -1)} className="p-1.5" aria-label="Remove one"><Minus size={14} /></button><span className="w-6 text-center font-semibold">{l.qty}</span><button onClick={() => bump(l.key, 1)} className="p-1.5" aria-label="Add one"><Plus size={14} /></button></div>
                <div className="w-16 text-right font-medium">{fmt(l.unit * l.qty)}</div>
              </div>))}
            <div className="mt-4 space-y-2.5">
              <input className="input" placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
              <input className="input" placeholder="Mobile number" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} autoComplete="tel-national" />
              {!dineIn && mode === "delivery" && <>
                <textarea className="input" rows={2} placeholder="Full delivery address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} autoComplete="street-address" />
                <div className="grid grid-cols-2 gap-2">{([["near", `Within 1 km · ${fmt(menu.outlet.feeNear)}`], ["far", `1–${menu.outlet.radius} km · ${fmt(menu.outlet.feeFar)}`]] as const).map(([id, l]) => <button key={id} onClick={() => setF({ ...f, distance: id })} className={`rounded-lg border px-2 py-2 text-xs font-medium ${f.distance === id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)]"}`}>{l}</button>)}</div></>}
              <input className="input" placeholder="Any note? (less spicy, extra tari…)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={200} />
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} name="website" />
            </div>
            <dl className="mt-4 space-y-1 text-sm"><div className="flex justify-between"><dt className="text-[var(--muted)]">Items</dt><dd>{fmt(subtotal)}</dd></div>{fee > 0 && <div className="flex justify-between"><dt className="text-[var(--muted)]">Delivery</dt><dd>{fmt(fee)}</dd></div>}<div className="flex justify-between border-t border-[var(--border)] pt-2 text-lg font-semibold"><dt>Total</dt><dd>{fmt(subtotal + fee)}</dd></div></dl>
            <p className="mt-1 text-xs text-[var(--muted)]">Prices include GST. You&apos;ll get payment options after placing the order.</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button disabled={busy} onClick={place} className="btn-primary btn-lg mt-4 w-full">{busy ? <Loader2 size={16} className="animate-spin" /> : <UtensilsCrossed size={16} />} Place order</button>
          </div>
        </div>)}
    </div>
  );
}

function CustomiseSheet({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (ids: number[]) => void }) {
  const [sel, setSel] = useState<number[]>(() => item.groups.flatMap((g) => g.mods.filter((m) => m.isDefault).map((m) => m.id)));
  const toggle = (g: Group, m: Mod) => setSel((s) => {
    const inGroup = s.filter((id) => g.mods.some((x) => x.id === id));
    if (s.includes(m.id)) return g.min > 0 && inGroup.length <= g.min ? s : s.filter((id) => id !== m.id);
    if (g.max === 1) return [...s.filter((id) => !inGroup.includes(id)), m.id];
    return inGroup.length >= g.max ? s : [...s, m.id];
  });
  const extra = item.groups.flatMap((g) => g.mods).filter((m) => sel.includes(m.id)).reduce((s, m) => s + m.price, 0);
  const missing = item.groups.some((g) => sel.filter((id) => g.mods.some((x) => x.id === id)).length < g.min);
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40 sm:items-center sm:justify-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={item.name} className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-md sm:rounded-2xl">
        <div className="flex items-start justify-between"><h2 className="text-lg font-semibold">{item.name}</h2><button onClick={onClose} aria-label="Close" className="rounded-md p-1 hover:bg-stone-100"><X size={18} /></button></div>
        <div className="mt-3 space-y-4">{item.groups.map((g) => (
          <div key={g.id}><div className="label">{g.name}{g.max > 1 ? " (choose any)" : ""}</div>
            <div className="flex flex-wrap gap-2">{g.mods.map((m) => <button key={m.id} onClick={() => toggle(g, m)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${sel.includes(m.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)]"}`}>{m.name}{m.price > 0 && <span className="ml-1 text-xs text-[var(--muted)]">+{fmt(m.price)}</span>}</button>)}</div></div>))}</div>
        <button disabled={missing} onClick={() => onAdd(sel)} className="btn-primary btn-lg mt-5 w-full">Add · {fmt(item.price + extra)}</button>
      </div>
    </div>
  );
}
