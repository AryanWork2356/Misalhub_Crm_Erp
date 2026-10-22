"use client";

import { computeTotals } from "@/lib/pricing";
import { fmt } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";

type ReceiptData = {
  order: {
    orderNo: string; type: string; createdAt: Date | string; customerName: string; customerPhone: string; deliveryAddress: string;
    subtotal: number; discount: number; deliveryFee: number; tip: number; roundOff: number; total: number; paid: number; notes: string; covers: number | null;
  };
  outlet: { name: string; address: string; phone: string; gstin: string; fssai: string; billFooter: string; taxInclusive: boolean; gstOn: boolean };
  lines: { name: string; qty: number; unitPrice: number; lineTotal: number; taxPct: string | number; modifiers: { name: string; price: number }[]; notes: string }[];
  payments: { method: string; amount: number }[];
  table: string | null;
};

const TYPE_LABEL: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", bulk: "Bulk order" };

/** 80mm thermal-style bill. Rendered inside #print-area so window.print() prints only this. */
export function BillReceipt({ data }: { data: ReceiptData }) {
  const { order, outlet, lines, payments, table } = data;
  const t = computeTotals({ lines, discount: order.discount, deliveryFee: order.deliveryFee, tip: order.tip, taxInclusive: outlet.taxInclusive, gstOn: outlet.gstOn });
  return (
    <div id="print-area" className="mx-auto w-[300px] bg-white p-3 font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <div className="text-sm font-bold">{outlet.name}</div>
        <div>{outlet.address}</div>
        {outlet.phone && <div>Ph: {outlet.phone}</div>}
        {outlet.gstin && <div>GSTIN: {outlet.gstin}</div>}
        {outlet.fssai && <div>FSSAI: {outlet.fssai}</div>}
      </div>
      <Sep />
      <div className="flex justify-between"><span>Bill #{order.orderNo}</span><span>{fmtDateTime(order.createdAt)}</span></div>
      <div className="flex justify-between"><span>{TYPE_LABEL[order.type] ?? order.type}{table ? ` · Table ${table}` : ""}</span>{order.covers ? <span>Covers: {order.covers}</span> : null}</div>
      {order.customerName || order.customerPhone ? <div>{order.customerName} {order.customerPhone}</div> : null}
      {order.type === "delivery" && order.deliveryAddress ? <div>Addr: {order.deliveryAddress}</div> : null}
      <Sep />
      <div className="grid grid-cols-[1fr_28px_52px_56px] font-bold"><span>Item</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Amt</span></div>
      {lines.map((l, i) => (
        <div key={i} className="mt-0.5">
          <div className="grid grid-cols-[1fr_28px_52px_56px]">
            <span>{l.name}</span><span className="text-right">{l.qty}</span>
            <span className="text-right">{(l.unitPrice / 100).toFixed(2)}</span><span className="text-right">{(l.lineTotal / 100).toFixed(2)}</span>
          </div>
          {l.modifiers.length > 0 && <div className="pl-2 text-[10px]">+ {l.modifiers.map((m) => m.name).join(", ")}</div>}
          {l.notes && <div className="pl-2 text-[10px]">* {l.notes}</div>}
        </div>
      ))}
      <Sep />
      <Row k="Sub total" v={fmt(t.subtotal, { decimals: true })} />
      {order.discount > 0 && <Row k="Discount" v={`-${fmt(order.discount, { decimals: true })}`} />}
      {order.deliveryFee > 0 && <Row k="Delivery charge" v={fmt(order.deliveryFee, { decimals: true })} />}
      {outlet.gstOn && t.taxBreakup.map((b) => (
        <div key={b.rate}>
          <Row k={`CGST ${b.rate / 2}%`} v={fmt(Math.round(b.tax / 2), { decimals: true })} />
          <Row k={`SGST ${b.rate / 2}%`} v={fmt(b.tax - Math.round(b.tax / 2), { decimals: true })} />
        </div>
      ))}
      {order.tip > 0 && <Row k="Tip" v={fmt(order.tip, { decimals: true })} />}
      {order.roundOff !== 0 && <Row k="Round off" v={(order.roundOff / 100).toFixed(2)} />}
      <Sep />
      <div className="flex justify-between text-sm font-bold"><span>TOTAL</span><span>{fmt(order.total, { decimals: true })}</span></div>
      {outlet.taxInclusive && outlet.gstOn && <div className="text-center text-[10px]">(Prices are inclusive of GST)</div>}
      {payments.length > 0 && <>
        <Sep />
        {payments.map((p, i) => <Row key={i} k={`Paid · ${p.method.toUpperCase()}`} v={fmt(p.amount, { decimals: true })} />)}
      </>}
      <Sep />
      <div className="text-center">{outlet.billFooter}</div>
    </div>
  );
}

export function KotSlip({ data }: { data: { order: { orderNo: string; type: string; createdAt: Date | string; notes: string; customerName: string }; kotNo: number | null; table: string | null; lines: { name: string; qty: number; modifiers: { name: string }[]; notes: string }[] } }) {
  return (
    <div id="print-area" className="mx-auto w-[300px] bg-white p-3 font-mono text-xs leading-snug text-black">
      <div className="text-center text-sm font-bold">KITCHEN ORDER TICKET</div>
      <Sep />
      <div className="flex justify-between text-sm font-bold"><span>KOT #{data.kotNo ?? "-"}</span><span>Order {data.order.orderNo}</span></div>
      <div className="flex justify-between"><span>{TYPE_LABEL[data.order.type] ?? data.order.type}{data.table ? ` · Table ${data.table}` : ""}</span><span>{fmtDateTime(data.order.createdAt)}</span></div>
      <Sep />
      {data.lines.map((l, i) => (
        <div key={i} className="mb-1">
          <div className="flex gap-2 text-sm font-bold"><span>{l.qty} ×</span><span>{l.name}</span></div>
          {l.modifiers.length > 0 && <div className="pl-5">{l.modifiers.map((m) => m.name).join(", ")}</div>}
          {l.notes && <div className="pl-5">* {l.notes}</div>}
        </div>
      ))}
      {data.order.notes && <><Sep /><div>Note: {data.order.notes}</div></>}
    </div>
  );
}

const Sep = () => <div className="my-1.5 border-t border-dashed border-black" />;
const Row = ({ k, v }: { k: string; v: string }) => <div className="flex justify-between"><span>{k}</span><span>{v}</span></div>;
