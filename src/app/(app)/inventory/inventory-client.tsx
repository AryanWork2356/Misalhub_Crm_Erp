"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { fmt } from "@/lib/money";
import { Modal } from "@/components/modal";
import { addIngredientAction, addSupplierAction, createPurchaseAction, saveRecipeAction, setMinStockAction, stockMoveAction } from "../../actions/inventory";

type Ing = { id: number; name: string; unit: string; cost: number };
type Row = { id: number; name: string; unit: string; category: string; qty: number; min: number; avgCost: number };

const num = (n: number) => +n.toFixed(3);

export function StockTable({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(false);
  const [move, setMove] = useState<{ row: Row; kind: "wastage" | "production" | "count" } | null>(null);
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) && (!only || r.qty <= r.min));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ingredients…" className="input pl-9" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} className="h-4 w-4 accent-brand-500" /> Low stock only</label>
      </div>
      <div className="space-y-2 md:hidden">
        {shown.map((r) => {
          const out = r.qty <= 0; const low = r.qty <= r.min;
          return (
            <div key={r.id} className="card p-3">
              <div className="flex items-start justify-between gap-2"><div><div className="font-semibold leading-tight">{r.name}</div><div className="text-xs text-[var(--muted)]">{r.category}</div></div>
                <span className={`badge ${out ? "bg-red-100 text-red-700" : low ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{out ? "Out" : low ? "Low" : "OK"}</span></div>
              <div className="mt-2 flex items-baseline justify-between text-sm"><span><b className="text-base tabular-nums">{num(r.qty)}</b> {r.unit} on hand</span><span className="text-[var(--muted)]">min {r.min} {r.unit}</span></div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button onClick={() => setMove({ row: r, kind: "production" })} className="btn-ghost btn-sm">+ Batch</button>
                <button onClick={() => setMove({ row: r, kind: "wastage" })} className="btn-ghost btn-sm">Waste</button>
                {canManage && <button onClick={() => setMove({ row: r, kind: "count" })} className="btn-ghost btn-sm">Count</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-[var(--border)]"><tr><th className="th">Ingredient</th><th className="th text-right">On hand</th><th className="th text-right">Minimum</th><th className="th text-right">Avg cost</th><th className="th text-right">Value</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody>
            {shown.map((r) => {
              const out = r.qty <= 0; const low = r.qty <= r.min;
              return (
                <tr key={r.id} className="border-b border-stone-100 last:border-0">
                  <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-[var(--muted)]">{r.category}</div></td>
                  <td className="td text-right font-medium tabular-nums">{num(r.qty)} {r.unit}</td>
                  <td className="td text-right tabular-nums text-[var(--muted)]">{canManage ? <MinEditor row={r} onSaved={() => router.refresh()} /> : `${r.min} ${r.unit}`}</td>
                  <td className="td text-right tabular-nums">{fmt(r.avgCost, { decimals: true })}/{r.unit}</td>
                  <td className="td text-right tabular-nums">{fmt(Math.round(Math.max(r.qty, 0) * r.avgCost))}</td>
                  <td className="td"><span className={`badge ${out ? "bg-red-100 text-red-700" : low ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{out ? "Out" : low ? "Low" : "OK"}</span></td>
                  <td className="td text-right whitespace-nowrap">
                    <button onClick={() => setMove({ row: r, kind: "production" })} className="btn-ghost btn-sm">+ Batch</button>{" "}
                    <button onClick={() => setMove({ row: r, kind: "wastage" })} className="btn-ghost btn-sm">Waste</button>
                    {canManage && <> <button onClick={() => setMove({ row: r, kind: "count" })} className="btn-ghost btn-sm">Count</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {move && <MoveDialog {...move} onClose={() => setMove(null)} onSaved={() => { setMove(null); router.refresh(); }} />}
    </>
  );
}

function MinEditor({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [v, setV] = useState(String(row.min));
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} onBlur={async () => { if (Number(v) !== row.min && Number(v) >= 0) { const r = await setMinStockAction(row.id, Number(v)); if (r.ok) onSaved(); else toast.error(r.error); } }}
      className="w-16 rounded border border-transparent bg-transparent px-1 text-right hover:border-[var(--border)] focus:border-brand-400 focus:outline-none" aria-label={`Minimum ${row.name}`} />
  );
}

function MoveDialog({ row, kind, onClose, onSaved }: { row: Row; kind: "wastage" | "production" | "count"; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(kind === "count" ? String(num(row.qty)) : "");
  const [note, setNote] = useState(kind === "production" ? "Fresh batch" : "");
  const title = kind === "wastage" ? `Log wastage · ${row.name}` : kind === "production" ? `Add batch / production · ${row.name}` : `Stock count · ${row.name}`;
  return (
    <Modal title={title} onClose={onClose}>
      <label className="label">{kind === "count" ? "Counted quantity" : "Quantity"} ({row.unit})</label>
      <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className="input" autoFocus />
      <label className="label mt-3">{kind === "wastage" ? "Reason" : "Note"}</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder={kind === "wastage" ? "Spoiled, spilled, expired…" : "Optional"} />
      <button disabled={qty === "" || Number(qty) < 0} onClick={async () => {
        const r = await stockMoveAction({ ingredientId: row.id, kind, qty: Number(qty), note });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Stock updated"); onSaved();
      }} className="btn-primary btn-lg mt-4 w-full">Save</button>
    </Modal>
  );
}

export function PurchaseForm({ today, suppliers, ingredients }: { today: string; suppliers: { id: number; name: string }[]; ingredients: Ing[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<number | null>(suppliers[0]?.id ?? null);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<{ ingredientId: number; qty: string; cost: string }[]>([{ ingredientId: ingredients[0]?.id ?? 0, qty: "", cost: "" }]);
  const [paid, setPaid] = useState("");
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);
  const ingMap = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold">Record purchase</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <div><label className="label">Supplier</label><select className="input" value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)}><option value="">— none —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">Invoice no.</label><input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
        <div><label className="label">Date</label><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select className="input flex-1" value={l.ingredientId} onChange={(e) => setLine(i, { ingredientId: Number(e.target.value), cost: String(((ingMap.get(Number(e.target.value))?.cost ?? 0) / 100)) })}>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select>
            <input type="number" min={0} step="any" placeholder="Qty" className="input w-24" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" />
            <input type="number" min={0} step="any" placeholder="₹/unit" className="input w-24" value={l.cost} onChange={(e) => setLine(i, { cost: e.target.value })} aria-label="Cost per unit" />
            {lines.length > 1 && <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded-md p-2 text-stone-400 hover:bg-stone-100" aria-label="Remove line"><Trash2 size={15} /></button>}
          </div>
        ))}
      </div>
      <button onClick={() => setLines((ls) => [...ls, { ingredientId: ingredients[0]?.id ?? 0, qty: "", cost: "" }])} className="btn-ghost btn-sm mt-2"><Plus size={14} /> Add line</button>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
        <div><label className="label">Paid now (₹)</label><div className="flex gap-2"><input type="number" min={0} className="input w-32" value={paid} onChange={(e) => setPaid(e.target.value)} /><button onClick={() => setPaid(String(total))} className="btn-ghost btn-sm">Full</button></div></div>
        <div className="text-right"><div className="text-xs text-[var(--muted)]">Total</div><div className="text-xl font-semibold">{fmt(Math.round(total * 100))}</div></div>
        <button disabled={total <= 0} onClick={async () => {
          const r = await createPurchaseAction({ supplierId, invoiceNo, date, paidRupees: Number(paid) || 0, note: "", lines: lines.filter((l) => Number(l.qty) > 0).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty), unitCostRupees: Number(l.cost) || 0 })) });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Purchase recorded — stock updated"); setLines([{ ingredientId: ingredients[0]?.id ?? 0, qty: "", cost: "" }]); setPaid(""); setInvoiceNo(""); router.refresh();
        }} className="btn-primary">Save purchase</button>
      </div>
    </section>
  );
}

export function IngredientForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", unit: "kg" as "kg" | "g" | "l" | "ml" | "pcs", category: "General", cost: "", min: "", open: "" });
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold">New ingredient</h3>
      <div className="grid grid-cols-2 gap-2">
        <input className="input col-span-2" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as typeof f.unit })}>{["kg", "g", "l", "ml", "pcs"].map((u) => <option key={u}>{u}</option>)}</select>
        <input className="input" placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <input className="input" type="number" placeholder="Cost ₹/unit" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
        <input className="input" type="number" placeholder="Min stock" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        <input className="input col-span-2" type="number" placeholder="Opening stock" value={f.open} onChange={(e) => setF({ ...f, open: e.target.value })} />
      </div>
      <button disabled={f.name.trim().length < 2} onClick={async () => {
        const r = await addIngredientAction({ name: f.name, unit: f.unit, category: f.category, costRupees: Number(f.cost) || 0, minQty: Number(f.min) || 0, openingQty: Number(f.open) || 0 });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Ingredient added"); setF({ ...f, name: "", cost: "", min: "", open: "" }); router.refresh();
      }} className="btn-dark mt-3 w-full">Add ingredient</button>
    </section>
  );
}

export function SupplierForm() {
  const router = useRouter();
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  return (
    <section className="card p-4">
      <h3 className="mb-3 font-semibold">New supplier</h3>
      <div className="flex gap-2"><input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} /><input className="input w-36" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <button disabled={name.trim().length < 2} onClick={async () => { const r = await addSupplierAction({ name, phone }); if (!r.ok) return void toast.error(r.error); toast.success("Supplier added"); setName(""); setPhone(""); router.refresh(); }} className="btn-dark mt-3 w-full">Add supplier</button>
    </section>
  );
}

export function RecipeEditor({ items, ingredients, recipes }: { items: { id: number; name: string }[]; ingredients: Ing[]; recipes: { itemId: number; ingredientId: number; qty: number }[] }) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? 0);
  const initial = (id: number) => recipes.filter((r) => r.itemId === id).map((r) => ({ ingredientId: r.ingredientId, qty: String(r.qty) }));
  const [lines, setLines] = useState(initial(itemId));
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  const cost = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (ingMap.get(l.ingredientId)?.cost ?? 0), 0);
  return (
    <section className="card max-w-2xl p-4">
      <p className="mb-3 text-sm text-[var(--muted)]">Quantity of each ingredient used per portion. This drives automatic stock deduction and food-cost %.</p>
      <select className="input" value={itemId} onChange={(e) => { setItemId(Number(e.target.value)); setLines(initial(Number(e.target.value))); }}>{items.map((i) => <option key={i.id} value={i.id}>{i.name} {recipes.some((r) => r.itemId === i.id) ? "" : "(no recipe)"}</option>)}</select>
      <div className="mt-3 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <select className="input flex-1" value={l.ingredientId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ingredientId: Number(e.target.value) } : x)))}>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <input type="number" min={0} step="any" className="input w-28" value={l.qty} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label="Quantity per portion" />
            <span className="w-10 self-center text-xs text-[var(--muted)]">{ingMap.get(l.ingredientId)?.unit}</span>
            <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="rounded-md p-2 text-stone-400 hover:bg-stone-100" aria-label="Remove ingredient"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setLines((ls) => [...ls, { ingredientId: ingredients[0]?.id ?? 0, qty: "" }])} className="btn-ghost btn-sm"><Plus size={14} /> Add ingredient</button>
        <span className="text-sm">Cost per portion <b>{fmt(Math.round(cost), { decimals: true })}</b></span>
      </div>
      <button onClick={async () => {
        const r = await saveRecipeAction(itemId, lines.filter((l) => Number(l.qty) > 0).map((l) => ({ ingredientId: l.ingredientId, qty: Number(l.qty) })));
        if (!r.ok) return void toast.error(r.error);
        toast.success("Recipe saved"); router.refresh();
      }} className="btn-primary btn-lg mt-4 w-full">Save recipe</button>
    </section>
  );
}
