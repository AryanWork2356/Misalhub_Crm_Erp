"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { addExpenseAction, deleteExpenseAction } from "../../actions/finance";

export function ExpenseForm({ today, categories }: { today: string; categories: string[] }) {
  const router = useRouter();
  const [f, setF] = useState({ category: categories[0], amount: "", method: "cash" as "cash" | "upi" | "bank" | "card", note: "", date: today });
  return (
    <section className="card p-4">
      <h3 className="mb-3 text-sm font-semibold">Add expense</h3>
      <div className="grid gap-2 sm:grid-cols-5">
        <select className="input sm:col-span-1" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">{categories.map((c) => <option key={c}>{c}</option>)}</select>
        <input type="number" min={0} step="any" className="input" placeholder="Amount ₹" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Amount" />
        <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as typeof f.method })} aria-label="Payment mode"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option><option value="card">Card</option></select>
        <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        <button disabled={!(Number(f.amount) > 0)} onClick={async () => {
          const r = await addExpenseAction({ category: f.category, amountRupees: Number(f.amount), method: f.method, note: f.note, date: f.date });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Expense added"); setF({ ...f, amount: "", note: "" }); router.refresh();
        }} className="btn-primary">Add</button>
        <input className="input sm:col-span-5" placeholder="Note (vendor, bill no…)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">Cash expenses reduce the expected cash in the drawer for the open shift.</p>
    </section>
  );
}

export function DeleteExpense({ id }: { id: number }) {
  const router = useRouter();
  return <button aria-label="Delete expense" onClick={async () => { if (!confirm("Delete this expense?")) return; const r = await deleteExpenseAction(id); if (!r.ok) return void toast.error(r.error); router.refresh(); }} className="rounded p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600"><Trash2 size={14} /></button>;
}
