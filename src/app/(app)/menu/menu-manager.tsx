"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search } from "lucide-react";
import { fmt } from "@/lib/money";
import { Modal } from "@/components/modal";
import { saveCategoryAction, saveItemAction, setOutletItemAction } from "../../actions/menu";

type Item = {
  id: number; categoryId: number; code: string; name: string; description: string; price: number; taxPct: number; isVeg: boolean; isBestseller: boolean; jainAvailable: boolean;
  spiceLevels: boolean; prepMinutes: number; station: "main" | "bar"; active: boolean; outletPrice: number | null; available: boolean; groupIds: number[]; cost: number | null;
};

export default function MenuManager({ items, categories, groups, canEdit }: { items: Item[]; categories: { id: number; name: string }[]; groups: { id: number; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(0);
  const [edit, setEdit] = useState<Partial<Item> | null>(null);
  const [priceFor, setPriceFor] = useState<Item | null>(null);
  const [newCat, setNewCat] = useState(false);

  const shown = useMemo(() => items.filter((i) => (!cat || i.categoryId === cat) && i.name.toLowerCase().includes(q.toLowerCase())), [items, cat, q]);

  async function toggleAvail(i: Item) {
    const r = await setOutletItemAction({ itemId: i.id, available: !i.available });
    if (!r.ok) return void toast.error(r.error);
    toast.success(i.available ? `${i.name} marked sold out` : `${i.name} back on the menu`);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" className="input pl-9" /></div>
        <select value={cat} onChange={(e) => setCat(Number(e.target.value))} className="input w-auto"><option value={0}>All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {canEdit && <div className="ml-auto flex gap-2">
          <button onClick={() => setNewCat(true)} className="btn-ghost">Add category</button>
          <button onClick={() => setEdit({ categoryId: categories[0]?.id, taxPct: 5, isVeg: true, prepMinutes: 8, station: "main", active: true, groupIds: [], price: 0 })} className="btn-primary"><Plus size={15} /> Add item</button>
        </div>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Item</th><th className="th">Category</th><th className="th text-right">Price</th><th className="th text-right">Food cost</th><th className="th text-right">GST</th><th className="th">Availability</th><th className="th" /></tr></thead>
          <tbody>
            {shown.map((i) => {
              const price = i.outletPrice ?? i.price;
              const pct = i.cost ? Math.round((i.cost / (price / (1 + i.taxPct / 100))) * 100) : null;
              return (
                <tr key={i.id} className={`border-b border-stone-100 last:border-0 ${!i.active ? "opacity-50" : ""}`}>
                  <td className="td"><div className="font-medium">{i.name} {i.isBestseller && <span title="Bestseller">⭐</span>}</div><div className="text-xs text-[var(--muted)]">{i.code}{!i.active && " · inactive"}{i.jainAvailable && " · Jain"}</div></td>
                  <td className="td text-[var(--muted)]">{categories.find((c) => c.id === i.categoryId)?.name}</td>
                  <td className="td text-right"><button onClick={() => setPriceFor(i)} className="font-medium hover:text-brand-700" title="Set outlet price">{fmt(price)}{i.outletPrice != null && <span className="ml-1 text-[10px] text-brand-700">local</span>}</button></td>
                  <td className="td text-right text-xs">{pct == null ? <span className="text-stone-300">no recipe</span> : <span className={pct > 40 ? "font-semibold text-red-600" : pct > 32 ? "text-amber-700" : "text-emerald-700"}>{pct}%</span>}</td>
                  <td className="td text-right text-[var(--muted)]">{i.taxPct}%</td>
                  <td className="td"><button onClick={() => toggleAvail(i)} className={`badge cursor-pointer ${i.available ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{i.available ? "Available" : "Sold out"}</button></td>
                  <td className="td text-right">{canEdit && <button onClick={() => setEdit(i)} className="rounded-md p-1.5 hover:bg-stone-100" aria-label={`Edit ${i.name}`}><Pencil size={15} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && <ItemDialog item={edit} categories={categories} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />}
      {priceFor && <PriceDialog item={priceFor} onClose={() => setPriceFor(null)} onSaved={() => { setPriceFor(null); router.refresh(); }} />}
      {newCat && <CategoryDialog onClose={() => setNewCat(false)} onSaved={() => { setNewCat(false); router.refresh(); }} />}
    </>
  );
}

function ItemDialog({ item, categories, groups, onClose, onSaved }: { item: Partial<Item>; categories: { id: number; name: string }[]; groups: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", description: "", ...item } as Item);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setSaving(true);
    const r = await saveItemAction({ id: f.id, categoryId: f.categoryId, name: f.name, description: f.description, price: f.price, taxPct: f.taxPct, isVeg: f.isVeg, isBestseller: f.isBestseller, jainAvailable: f.jainAvailable, spiceLevels: f.spiceLevels, prepMinutes: f.prepMinutes, station: f.station, active: f.active, groupIds: f.groupIds });
    setSaving(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Saved"); onSaved();
  }
  const Check = ({ k, label }: { k: "isVeg" | "isBestseller" | "jainAvailable" | "spiceLevels" | "active"; label: string }) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-brand-500" />{label}</label>
  );
  return (
    <Modal title={f.id ? `Edit ${item.name}` : "New menu item"} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Name</label><input value={f.name} onChange={(e) => set("name", e.target.value)} className="input" autoFocus /></div>
        <div className="sm:col-span-2"><label className="label">Description</label><input value={f.description} onChange={(e) => set("description", e.target.value)} className="input" /></div>
        <div><label className="label">Category</label><select value={f.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))} className="input">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label className="label">Price (₹)</label><input type="number" min={0} step="0.5" value={f.price / 100} onChange={(e) => set("price", Math.round(Number(e.target.value) * 100))} className="input" /></div>
        <div><label className="label">GST %</label><select value={f.taxPct} onChange={(e) => set("taxPct", Number(e.target.value))} className="input">{[0, 5, 12, 18, 28].map((p) => <option key={p} value={p}>{p}%</option>)}</select></div>
        <div><label className="label">Prep time (min)</label><input type="number" min={1} value={f.prepMinutes} onChange={(e) => set("prepMinutes", Number(e.target.value))} className="input" /></div>
        <div><label className="label">Kitchen station</label><select value={f.station} onChange={(e) => set("station", e.target.value as "main" | "bar")} className="input"><option value="main">Main kitchen</option><option value="bar">Beverages</option></select></div>
        <div className="grid grid-cols-2 gap-2 self-end"><Check k="isVeg" label="Veg" /><Check k="isBestseller" label="Bestseller" /><Check k="jainAvailable" label="Jain option" /><Check k="spiceLevels" label="Spice levels" /><Check k="active" label="Active" /></div>
        <div className="sm:col-span-2"><label className="label">Modifier groups shown in POS</label>
          <div className="flex flex-wrap gap-2">{groups.map((g) => (
            <button key={g.id} type="button" onClick={() => set("groupIds", f.groupIds?.includes(g.id) ? f.groupIds.filter((x) => x !== g.id) : [...(f.groupIds ?? []), g.id])}
              className={`rounded-lg border px-3 py-1.5 text-sm ${f.groupIds?.includes(g.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)]"}`}>{g.name}</button>))}</div></div>
      </div>
      <button disabled={saving} onClick={save} className="btn-primary btn-lg mt-5 w-full">{saving ? "Saving…" : "Save item"}</button>
    </Modal>
  );
}

function PriceDialog({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(item.outletPrice != null ? String(item.outletPrice / 100) : "");
  return (
    <Modal title={`Outlet price · ${item.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--muted)]">Master price is {fmt(item.price)}. Set a different price for this outlet only, or clear it to follow the master price.</p>
      <input type="number" min={0} step="0.5" value={v} onChange={(e) => setV(e.target.value)} placeholder="Leave empty to use master price" className="input" autoFocus />
      <button onClick={async () => {
        const r = await setOutletItemAction({ itemId: item.id, price: v === "" ? null : Math.round(Number(v) * 100) });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Price updated"); onSaved();
      }} className="btn-primary btn-lg mt-4 w-full">Save</button>
    </Modal>
  );
}

function CategoryDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  return (
    <Modal title="New category" onClose={onClose}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Desserts" className="input" autoFocus />
      <button disabled={name.trim().length < 2} onClick={async () => { const r = await saveCategoryAction({ name }); if (!r.ok) return void toast.error(r.error); onSaved(); }} className="btn-primary btn-lg mt-4 w-full">Add category</button>
    </Modal>
  );
}
