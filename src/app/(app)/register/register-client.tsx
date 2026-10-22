"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { fmt } from "@/lib/money";
import { fmtDate } from "@/lib/dates";
import { Modal } from "@/components/modal";
import { closeShiftAction, openShiftAction } from "../../actions/finance";

export function ShiftControls({ isOpen }: { isOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <>
      <button onClick={() => setOpen(true)} className={isOpen ? "btn-dark w-full" : "btn-primary w-full"}>{isOpen ? "Close shift & count cash" : "Open shift"}</button>
      {open && (
        <Modal title={isOpen ? "Close shift" : "Open shift"} onClose={() => setOpen(false)}>
          <label className="label">{isOpen ? "Cash counted in the drawer (₹)" : "Opening float (₹)"}</label>
          <input type="number" min={0} step="any" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          {isOpen && <><label className="label mt-3">Notes (optional)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid vendor ₹200 from drawer" /></>}
          <button disabled={amount === ""} onClick={async () => {
            if (isOpen) {
              const r = await closeShiftAction(Number(amount), notes);
              if (!r.ok) return void toast.error(r.error);
              toast[r.variance === 0 ? "success" : "warning"](r.variance === 0 ? "Shift closed — cash balanced" : `Shift closed — ${r.variance > 0 ? "over" : "short"} by ${fmt(Math.abs(r.variance))}`);
            } else {
              const r = await openShiftAction(Number(amount));
              if (!r.ok) return void toast.error(r.error);
              toast.success("Shift opened");
            }
            setOpen(false); setAmount(""); setNotes(""); router.refresh();
          }} className="btn-primary btn-lg mt-4 w-full">{isOpen ? "Close shift" : "Open shift"}</button>
        </Modal>
      )}
    </>
  );
}

type Sum = { sales: number; orders: number; tax: number; discount: number; delivery: number; cancelled: number; cancelledValue: number };

export function ZReport({ date, outlet, sum, pay }: { date: string; outlet: { name: string; address: string }; sum: Sum; pay: { k: string; v: number; n: number }[] }) {
  const router = useRouter();
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Day-end report (Z)</h3>
        <div className="flex gap-2"><input type="date" defaultValue={date} onChange={(e) => e.target.value && router.push(`/register?date=${e.target.value}`)} className="input w-auto py-1" aria-label="Report date" />
          <button onClick={() => window.print()} className="btn-ghost btn-sm"><Printer size={14} /> Print</button></div>
      </div>
      <div id="print-area" className="mx-auto max-w-[320px] font-mono text-xs leading-relaxed text-black">
        <div className="text-center"><div className="text-sm font-bold">{outlet.name}</div><div>DAY-END REPORT</div><div>{fmtDate(date)}</div></div>
        <div className="my-2 border-t border-dashed border-black" />
        <R k="Total orders" v={String(sum.orders)} /><R k="Gross sales" v={fmt(sum.sales, { decimals: true })} /><R k="GST included" v={fmt(sum.tax, { decimals: true })} />
        <R k="Discounts" v={fmt(sum.discount, { decimals: true })} /><R k="Delivery charges" v={fmt(sum.delivery, { decimals: true })} /><R k={`Cancelled (${sum.cancelled})`} v={fmt(sum.cancelledValue, { decimals: true })} />
        <div className="my-2 border-t border-dashed border-black" /><div className="font-bold">COLLECTIONS</div>
        {pay.map((p) => <R key={p.k} k={`${p.k.toUpperCase()} (${p.n})`} v={fmt(p.v, { decimals: true })} />)}
        <div className="my-2 border-t border-dashed border-black" />
        <R k="TOTAL COLLECTED" v={fmt(pay.reduce((s, p) => s + p.v, 0), { decimals: true })} bold />
      </div>
    </section>
  );
}

const R = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => <div className={`flex justify-between ${bold ? "font-bold" : ""}`}><span>{k}</span><span>{v}</span></div>;
