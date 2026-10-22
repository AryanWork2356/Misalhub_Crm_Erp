"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  Search, Plus, Minus, Trash2, ShoppingBag, UtensilsCrossed, Bike, Users, X, Printer, ChefHat, Wallet, Percent, Tag, Loader2, Armchair, StickyNote, Receipt, Phone, CheckCircle2,
} from "lucide-react";
import { fmt } from "@/lib/money";
import { computeTotals, manualDiscount } from "@/lib/pricing";
import { minutesAgo } from "@/lib/dates";
import { BillReceipt, KotSlip } from "@/components/receipt";
import { Modal, PrintDialog } from "@/components/modal";
import {
  cancelLineAction, cancelOrderAction, checkCouponAction, kotSlipAction, loadOrderAction, markServedAction, payOrderAction, receiptAction, searchCustomersAction, sendKotAction, submitOrderAction, type OrderPayload,
} from "../../actions/pos";

type Mod = { id: number; name: string; price: number; isDefault: boolean };
type Group = { id: number; name: string; min: number; max: number; mods: Mod[] };
type PosItem = { id: number; name: string; categoryId: number; price: number; taxPct: number; isVeg: boolean; best: boolean; desc: string; available: boolean; groups: Group[] };
export type PosData = {
  outlet: { id: number; name: string; taxInclusive: boolean; gstOn: boolean; upiId: string; deliveryFeeNear: number; deliveryFeeFar: number; loyaltyEnabled: boolean; gstin: string };
  categories: { id: number; name: string }[];
  items: PosItem[];
  tables: { id: number; name: string; section: string; capacity: number; order: { id: number; orderNo: string; total: number; status: string; createdAt: string } | null }[];
  openOrders: { id: number; orderNo: string; type: string; status: string; total: number; customerName: string; createdAt: string }[];
};

type OrderType = "dine_in" | "takeaway" | "delivery" | "bulk";
type Draft = { key: string; itemId: number; name: string; unit: number; taxPct: number; qty: number; modIds: number[]; modNames: string[]; notes: string };
type Sent = { id: number; name: string; qty: number; unitPrice: number; lineTotal: number; taxPct: string; modifiers: { id: number; name: string; price: number }[]; status: string; kotId: number | null; notes: string };
type Customer = { id: number; name: string; phone: string; loyaltyPoints: number; visits: number; totalSpent: number; address: string };

const TYPES: { id: OrderType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "dine_in", label: "Dine-in", icon: UtensilsCrossed }, { id: "takeaway", label: "Takeaway", icon: ShoppingBag }, { id: "delivery", label: "Delivery", icon: Bike }, { id: "bulk", label: "Bulk", icon: Users },
];
const STATUS_STYLE: Record<string, string> = {
  new: "bg-amber-100 text-amber-800", preparing: "bg-blue-100 text-blue-800", ready: "bg-emerald-100 text-emerald-800", served: "bg-stone-200 text-stone-700", out_for_delivery: "bg-violet-100 text-violet-800",
};
const uid = () => Math.random().toString(36).slice(2, 9);

export default function PosClient({ data, initialOrderId, canOverride }: { data: PosData; initialOrderId: number | null; canOverride: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // --- order state ---
  const [type, setType] = useState<OrderType>("dine_in");
  const [tableId, setTableId] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState<string | null>(null);
  const [paid, setPaid] = useState(0);
  const [covers, setCovers] = useState<number | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [address, setAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(data.outlet.deliveryFeeNear);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [discKind, setDiscKind] = useState<"none" | "percent" | "flat">("none");
  const [discVal, setDiscVal] = useState(0);
  const [discReason, setDiscReason] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponAmt, setCouponAmt] = useState(0);
  const [redeem, setRedeem] = useState(0);
  const [notes, setNotes] = useState("");

  // --- ui state ---
  const [cat, setCat] = useState<number | "best" | "all">("all");
  const [q, setQ] = useState("");
  const [modItem, setModItem] = useState<PosItem | null>(null);
  const [showTables, setShowTables] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showDisc, setShowDisc] = useState(false);
  const [showCust, setShowCust] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [receipt, setReceipt] = useState<React.ComponentProps<typeof BillReceipt>["data"] | null>(null);
  const [kotSlip, setKotSlip] = useState<React.ComponentProps<typeof KotSlip>["data"] | null>(null);
  const [cancelling, setCancelling] = useState<{ kind: "order" } | { kind: "line"; id: number; name: string } | null>(null);

  const itemMap = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const tableName = data.tables.find((t) => t.id === tableId)?.name;

  const resetOrder = useCallback((keepType = false) => {
    setOrderId(null); setOrderNo(null); setPaid(0); setTableId(null); setCovers(null); setCustomer(null); setCustName(""); setCustPhone(""); setAddress("");
    setDrafts([]); setSent([]); setDiscKind("none"); setDiscVal(0); setDiscReason(""); setCouponCode(null); setCouponAmt(0); setRedeem(0); setNotes("");
    setDeliveryFee(data.outlet.deliveryFeeNear); if (!keepType) setType("dine_in");
  }, [data.outlet.deliveryFeeNear]);

  const hydrate = useCallback(async (id: number) => {
    const r = await loadOrderAction(id);
    if (!r.ok) { toast.error(r.error); return false; }
    const { order, lines } = r;
    setOrderId(order.id); setOrderNo(order.orderNo); setPaid(order.paid); setType(order.type); setTableId(order.tableId); setCovers(order.covers);
    setCustName(order.customerName); setCustPhone(order.customerPhone); setAddress(order.deliveryAddress); setDeliveryFee(order.deliveryFee);
    setDiscKind(order.discountKind); setDiscVal(order.discountValue); setDiscReason(order.discountReason); setCouponCode(order.couponCode); setCouponAmt(order.couponDiscount);
    setRedeem(order.loyaltyRedeemed); setNotes(order.notes);
    setSent(lines.filter((l) => l.status !== "cancelled" && l.kotId).map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitPrice: l.unitPrice, lineTotal: l.lineTotal, taxPct: l.taxPct, modifiers: l.modifiers, status: l.status, kotId: l.kotId, notes: l.notes })));
    // unsent lines (held) come back as editable drafts
    setDrafts(lines.filter((l) => !l.kotId && l.status !== "cancelled").map((l) => ({ key: uid(), itemId: l.itemId, name: l.name, unit: l.unitPrice, taxPct: Number(l.taxPct), qty: l.qty, modIds: l.modifiers.map((m) => m.id), modNames: l.modifiers.map((m) => m.name), notes: l.notes })));
    return true;
  }, []);

  useEffect(() => { if (initialOrderId) void hydrate(initialOrderId); }, [initialOrderId, hydrate]);

  // --- catalogue ---
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.items.filter((i) => {
      if (term) return i.name.toLowerCase().includes(term);
      if (cat === "best") return i.best;
      if (cat === "all") return true;
      return i.categoryId === cat;
    });
  }, [data.items, cat, q]);

  // --- cart ops ---
  function addToCart(item: PosItem, modIds: number[] = [], note = "") {
    if (!item.available) return toast.error(`${item.name} is out of stock`);
    const mods = item.groups.flatMap((g) => g.mods).filter((m) => modIds.includes(m.id));
    const unit = item.price + mods.reduce((s, m) => s + m.price, 0);
    setDrafts((d) => {
      const idx = d.findIndex((x) => x.itemId === item.id && x.notes === note && x.modIds.slice().sort().join() === modIds.slice().sort().join());
      if (idx >= 0) return d.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x));
      return [...d, { key: uid(), itemId: item.id, name: item.name, unit, taxPct: item.taxPct, qty: 1, modIds, modNames: mods.map((m) => m.name), notes: note }];
    });
  }
  const tap = (item: PosItem) => (item.groups.length ? setModItem(item) : addToCart(item));
  const bump = (key: string, delta: number) => setDrafts((d) => d.flatMap((x) => (x.key !== key ? [x] : x.qty + delta <= 0 ? [] : [{ ...x, qty: x.qty + delta }])));

  // --- totals (preview; the server recomputes authoritatively) ---
  const subtotal = drafts.reduce((s, l) => s + l.unit * l.qty, 0) + sent.reduce((s, l) => s + l.lineTotal, 0);
  const manual = manualDiscount(discKind, discVal, subtotal);
  const loyaltyAmt = Math.min(redeem * 100, Math.max(subtotal - manual - couponAmt, 0));
  const totals = computeTotals({
    lines: [...drafts.map((l) => ({ lineTotal: l.unit * l.qty, taxPct: l.taxPct })), ...sent.map((l) => ({ lineTotal: l.lineTotal, taxPct: l.taxPct }))],
    discount: manual + couponAmt + loyaltyAmt, deliveryFee: type === "delivery" ? deliveryFee : 0, taxInclusive: data.outlet.taxInclusive, gstOn: data.outlet.gstOn,
  });
  const due = Math.max(totals.total - paid, 0);

  // keep coupon amount in sync with the cart
  useEffect(() => {
    if (!couponCode) return;
    const t = setTimeout(async () => {
      const r = await checkCouponAction(couponCode, subtotal);
      if (r.ok) setCouponAmt(r.amount); else { setCouponCode(null); setCouponAmt(0); toast.info(`Coupon removed: ${r.error}`); }
    }, 300);
    return () => clearTimeout(t);
  }, [subtotal, couponCode]);

  function payload(fireKot: boolean): OrderPayload {
    return {
      orderId: orderId ?? undefined, type, tableId, covers, customerId: customer?.id ?? null, customerName: custName || customer?.name || "", customerPhone: custPhone || customer?.phone || "",
      deliveryAddress: address, deliveryFee: type === "delivery" ? deliveryFee : 0,
      lines: drafts.map((d) => ({ itemId: d.itemId, qty: d.qty, modifierIds: d.modIds, notes: d.notes })),
      discountKind: discKind, discountValue: discVal, discountReason: discReason, couponCode, loyaltyRedeem: redeem, notes, fireKot,
    };
  }

  async function save(fire: boolean): Promise<number | null> {
    if (!drafts.length && !orderId) { toast.error("Add some items first"); return null; }
    setSaving(true);
    try {
      const r = await submitOrderAction(payload(fire));
      if (!r.ok) { toast.error(r.error); return null; }
      await hydrate(r.orderId);
      toast.success(fire ? (r.kotNo ? `KOT #${r.kotNo} sent to kitchen` : "Order updated") : `Order ${r.orderNo} saved`);
      router.refresh();
      return r.orderId;
    } finally { setSaving(false); }
  }

  async function openPay() {
    const hasDraft = drafts.length > 0;
    const id = hasDraft || !orderId ? await save(true) : orderId;
    if (id) setShowPay(true);
  }

  async function showReceiptFor(id: number) {
    const r = await receiptAction(id);
    if (r.ok) setReceipt({ order: r.order, outlet: { ...r.outlet, taxInclusive: r.outlet.taxInclusive, gstOn: r.outlet.gstOn }, lines: r.lines, payments: r.payments, table: r.table });
  }
  async function printKot() {
    if (!orderId) return;
    const r = await kotSlipAction(orderId);
    if (r.ok) setKotSlip({ order: r.order, kotNo: r.kotNo, table: r.table, lines: r.lines });
  }

  async function doCancel(reason: string) {
    if (!cancelling) return;
    const r = cancelling.kind === "order" ? await cancelOrderAction(orderId!, reason) : await cancelLineAction(cancelling.id, reason);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Cancelled");
    setCancelling(null);
    if (cancelling.kind === "order") resetOrder(); else if (orderId) await hydrate(orderId);
    router.refresh();
  }

  // ---------- render ----------
  const hasLines = drafts.length + sent.length > 0;
  const cartCount = drafts.reduce((s, d) => s + d.qty, 0) + sent.reduce((s, d) => s + d.qty, 0);

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col lg:h-screen">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-white px-3 py-2">
        <div className="flex rounded-lg bg-stone-100 p-0.5">
          {TYPES.map((t) => (
            <button key={t.id} disabled={!!orderId && sent.length > 0 && t.id !== type} onClick={() => { setType(t.id); if (t.id !== "dine_in") setTableId(null); }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${type === t.id ? "bg-white shadow-sm text-brand-700" : "text-stone-600"}`}>
              <t.icon size={15} /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        {type === "dine_in" && (
          <button onClick={() => setShowTables(true)} className="btn-ghost btn-sm"><Armchair size={15} /> {tableName ? `Table ${tableName}` : "Select table"}</button>
        )}
        <button onClick={() => setShowCust(true)} className="btn-ghost btn-sm"><Users size={15} /> {customer?.name || custName || custPhone || "Customer"}</button>
        {orderNo && <span className="badge bg-brand-50 text-brand-700">Order #{orderNo}</span>}
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu…" className="input pl-9" />
        </div>
        <button onClick={() => resetOrder()} className="btn-ghost btn-sm" title="Start a new order"><Plus size={15} /> New</button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* categories */}
        <div className="hidden w-36 shrink-0 flex-col gap-1 overflow-y-auto border-r border-[var(--border)] bg-white p-2 scrollbar-thin md:flex">
          <CatBtn active={cat === "all"} onClick={() => setCat("all")}>All items</CatBtn>
          <CatBtn active={cat === "best"} onClick={() => setCat("best")}>⭐ Bestsellers</CatBtn>
          {data.categories.map((c) => <CatBtn key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</CatBtn>)}
        </div>

        {/* items */}
        <div className="min-w-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
          <div className="mb-3 flex gap-1.5 overflow-x-auto md:hidden">
            {[{ id: "all" as const, name: "All" }, { id: "best" as const, name: "⭐ Best" }, ...data.categories].map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${cat === c.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white"}`}>{c.name}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((i) => (
              <button key={i.id} onClick={() => tap(i)} disabled={!i.available}
                className={`card flex min-h-[84px] flex-col justify-between p-3 text-left transition hover:border-brand-300 hover:shadow-md active:scale-[0.98] ${!i.available ? "opacity-40" : ""}`}>
                <div className="flex items-start gap-1.5">
                  <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-sm border ${i.isVeg ? "border-green-600" : "border-red-600"}`}><span className={`m-[1px] block h-1.5 w-1.5 rounded-full ${i.isVeg ? "bg-green-600" : "bg-red-600"}`} /></span>
                  <span className="text-sm font-medium leading-tight">{i.name}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-brand-700">{fmt(i.price)}</span>
                  {!i.available ? <span className="badge bg-stone-200 text-stone-600">Sold out</span> : i.groups.length > 0 ? <span className="text-[10px] text-stone-400">customise</span> : null}
                </div>
              </button>
            ))}
            {visible.length === 0 && <div className="col-span-full py-16 text-center text-sm text-[var(--muted)]">No items match.</div>}
          </div>
        </div>

        {/* cart */}
        <aside className={`${cartOpen ? "fixed inset-0 z-40 flex" : "hidden"} w-full flex-col bg-white lg:static lg:flex lg:w-[380px] lg:shrink-0 lg:border-l lg:border-[var(--border)]`}>
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3 lg:hidden">
            <div className="font-semibold">Current order</div>
            <button onClick={() => setCartOpen(false)} className="rounded-md p-1.5 hover:bg-stone-100"><X size={18} /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
            {!hasLines && (
              <div className="grid h-full place-items-center text-center text-sm text-[var(--muted)]">
                <div><ShoppingBag className="mx-auto mb-2 text-stone-300" size={36} />Tap items to start an order</div>
              </div>
            )}
            {sent.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"><ChefHat size={12} /> Sent to kitchen</div>
                {sent.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 border-b border-stone-100 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{l.qty} × {l.name} <span className={`badge ml-1 ${STATUS_STYLE[l.status === "pending" ? "new" : l.status] ?? "bg-stone-100"}`}>{l.status}</span></div>
                      {l.modifiers.length > 0 && <div className="text-xs text-[var(--muted)]">{l.modifiers.map((m) => m.name).join(", ")}</div>}
                      {l.notes && <div className="text-xs text-[var(--muted)]">“{l.notes}”</div>}
                    </div>
                    <div className="text-right"><div className="font-medium">{fmt(l.lineTotal)}</div>
                      {paid === 0 && <button onClick={() => setCancelling({ kind: "line", id: l.id, name: l.name })} className="text-[11px] text-red-600 hover:underline">cancel</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {drafts.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">New items</div>
                {drafts.map((l) => (
                  <div key={l.key} className="flex items-start gap-2 border-b border-stone-100 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">{l.name}</div>
                      {l.modNames.length > 0 && <div className="text-xs text-[var(--muted)]">{l.modNames.join(", ")}</div>}
                      <input value={l.notes} onChange={(e) => setDrafts((d) => d.map((x) => (x.key === l.key ? { ...x, notes: e.target.value } : x)))} placeholder="Note (e.g. less spicy)" maxLength={80}
                        className="mt-1 w-full border-0 border-b border-dashed border-stone-200 bg-transparent py-0.5 text-xs outline-none placeholder:text-stone-300 focus:border-brand-400" />
                    </div>
                    <div className="flex items-center rounded-lg border border-[var(--border)]">
                      <button onClick={() => bump(l.key, -1)} className="p-1.5 hover:bg-stone-50" aria-label="decrease">{l.qty === 1 ? <Trash2 size={14} className="text-red-500" /> : <Minus size={14} />}</button>
                      <span className="w-6 text-center text-sm font-semibold">{l.qty}</span>
                      <button onClick={() => bump(l.key, 1)} className="p-1.5 hover:bg-stone-50" aria-label="increase"><Plus size={14} /></button>
                    </div>
                    <div className="w-16 text-right font-medium">{fmt(l.unit * l.qty)}</div>
                  </div>
                ))}
              </div>
            )}
            {type === "delivery" && (
              <div className="mt-3 space-y-2 rounded-lg bg-stone-50 p-3">
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Delivery address *" className="input" />
                <div className="flex gap-2">
                  {[{ l: "≤ 1 km", v: data.outlet.deliveryFeeNear }, { l: "1–5 km", v: data.outlet.deliveryFeeFar }].map((o) => (
                    <button key={o.l} onClick={() => setDeliveryFee(o.v)} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${deliveryFee === o.v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white"}`}>{o.l} · {fmt(o.v)}</button>
                  ))}
                </div>
              </div>
            )}
            {type === "dine_in" && tableId && (
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">Covers
                <input type="number" min={1} max={30} value={covers ?? ""} onChange={(e) => setCovers(e.target.value ? Number(e.target.value) : null)} className="input w-16 py-1" />
              </div>
            )}
            <div className="mt-3 flex items-start gap-2"><StickyNote size={14} className="mt-2 text-stone-400" />
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order note (packing, allergy…)" className="input py-1.5 text-xs" />
            </div>
          </div>

          {/* totals + actions */}
          <div className="border-t border-[var(--border)] bg-stone-50/60 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button onClick={() => setShowDisc(true)} className="btn-ghost btn-sm"><Percent size={13} /> Discount{totals.discount > 0 ? ` (${fmt(totals.discount)})` : ""}</button>
              {orderId && sent.length > 0 && <button onClick={() => void printKot()} className="btn-ghost btn-sm"><Printer size={13} /> KOT</button>}
              {orderId && paid === 0 && <button onClick={() => setCancelling({ kind: "order" })} className="btn-ghost btn-sm text-red-600"><X size={13} /> Cancel order</button>}
              {orderId && <button onClick={() => void showReceiptFor(orderId)} className="btn-ghost btn-sm"><Receipt size={13} /> Bill</button>}
            </div>
            <dl className="space-y-0.5 text-sm">
              <Line k="Subtotal" v={fmt(totals.subtotal)} />
              {totals.discount > 0 && <Line k="Discount" v={`− ${fmt(totals.discount)}`} accent />}
              {type === "delivery" && <Line k="Delivery" v={fmt(deliveryFee)} />}
              {data.outlet.gstOn && totals.tax > 0 && <Line k={data.outlet.taxInclusive ? "GST (included)" : "GST"} v={fmt(totals.tax, { decimals: true })} muted />}
              {paid > 0 && <Line k="Paid" v={`− ${fmt(paid)}`} />}
              <div className="flex items-baseline justify-between pt-1.5 text-lg font-semibold"><dt>{paid > 0 ? "Balance" : "Total"}</dt><dd>{fmt(paid > 0 ? due : totals.total)}</dd></div>
            </dl>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button disabled={saving || !hasLines} onClick={() => void save(false)} className="btn-ghost">Hold</button>
              <button disabled={saving || (!drafts.length && !orderId)} onClick={() => void save(true)} className="btn-dark"><ChefHat size={15} /> KOT</button>
              <button disabled={saving || !hasLines || (!!orderId && due === 0 && drafts.length === 0)} onClick={() => void openPay()} className="btn-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Wallet size={15} />} Pay</button>
            </div>
            {orderId && sent.length > 0 && type === "dine_in" && (
              <button onClick={async () => { const r = await markServedAction(orderId); if (r.ok) { toast.success("Marked served"); await hydrate(orderId); router.refresh(); } }} className="btn-ghost btn-sm mt-2 w-full">Mark all served</button>
            )}
          </div>
        </aside>
      </div>

      {/* mobile cart button */}
      <button onClick={() => setCartOpen(true)} className="btn-primary fixed bottom-4 right-4 z-30 h-14 rounded-full px-5 shadow-lg lg:hidden">
        <ShoppingBag size={18} /> {cartCount} · {fmt(totals.total)}
      </button>

      {/* dialogs */}
      {modItem && <ModifierDialog item={modItem} onClose={() => setModItem(null)} onAdd={(ids, note) => { addToCart(modItem, ids, note); setModItem(null); }} />}
      {showTables && <TablePicker data={data} current={tableId} onClose={() => setShowTables(false)} onPick={async (t) => {
        setShowTables(false);
        if (t.order) { await hydrate(t.order.id); } else { resetOrder(true); setType("dine_in"); setTableId(t.id); }
      }} openOrders={data.openOrders} onOpenOrder={async (id) => { setShowTables(false); await hydrate(id); }} />}
      {showCust && <CustomerDialog onClose={() => setShowCust(false)} loyaltyEnabled={data.outlet.loyaltyEnabled}
        customer={customer} name={custName} phone={custPhone}
        onPick={(c) => { setCustomer(c); setCustName(c.name); setCustPhone(c.phone); if (c.address && !address) setAddress(c.address); setShowCust(false); }}
        onManual={(n, p) => { setCustomer(null); setCustName(n); setCustPhone(p); setShowCust(false); }} />}
      {showDisc && <DiscountDialog canOverride={canOverride} kind={discKind} value={discVal} reason={discReason} couponCode={couponCode} couponAmt={couponAmt} subtotal={subtotal}
        points={customer?.loyaltyPoints ?? 0} redeem={redeem} loyaltyEnabled={data.outlet.loyaltyEnabled && !!(customer || custPhone)} onClose={() => setShowDisc(false)}
        onApply={(v) => { setDiscKind(v.kind); setDiscVal(v.value); setDiscReason(v.reason); setCouponCode(v.coupon); setCouponAmt(v.couponAmt); setRedeem(v.redeem); setShowDisc(false); }} />}
      {showPay && orderId && <PayDialog due={due} upiId={data.outlet.upiId} outletName={data.outlet.name} orderNo={orderNo ?? ""} onClose={() => setShowPay(false)} onPay={async (rows) => {
        const r = await payOrderAction(orderId, rows);
        if (!r.ok) { toast.error(r.error); return; }
        setShowPay(false);
        toast.success(r.change > 0 ? `Paid · return change ${fmt(r.change)}` : r.fullyPaid ? "Payment complete" : "Part payment recorded");
        await showReceiptFor(orderId);
        if (r.fullyPaid && (type === "dine_in" || type === "takeaway")) resetOrder(true); else await hydrate(orderId);
        router.refresh();
      }} />}
      {receipt && <PrintDialog title="Bill" onClose={() => setReceipt(null)}><BillReceipt data={receipt} /></PrintDialog>}
      {kotSlip && <PrintDialog title="Kitchen ticket" onClose={() => setKotSlip(null)}><KotSlip data={kotSlip} /></PrintDialog>}
      {cancelling && <ReasonDialog title={cancelling.kind === "order" ? "Cancel this order?" : `Cancel ${cancelling.name}?`} onClose={() => setCancelling(null)} onConfirm={doCancel} />}
    </div>
  );
}

// ---------- small pieces ----------
const CatBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${active ? "bg-brand-500 text-white" : "text-stone-600 hover:bg-stone-100"}`}>{children}</button>
);
const Line = ({ k, v, muted, accent }: { k: string; v: string; muted?: boolean; accent?: boolean }) => (
  <div className={`flex justify-between ${muted ? "text-xs text-[var(--muted)]" : ""} ${accent ? "text-emerald-700" : ""}`}><dt>{k}</dt><dd>{v}</dd></div>
);

function ModifierDialog({ item, onClose, onAdd }: { item: PosItem; onClose: () => void; onAdd: (ids: number[], note: string) => void }) {
  const [sel, setSel] = useState<number[]>(() => item.groups.flatMap((g) => g.mods.filter((m) => m.isDefault).map((m) => m.id)));
  const [note, setNote] = useState("");
  const toggle = (g: Group, m: Mod) => setSel((s) => {
    if (s.includes(m.id)) return g.min > 0 && s.filter((id) => g.mods.some((x) => x.id === id)).length <= g.min ? s : s.filter((id) => id !== m.id);
    const inGroup = s.filter((id) => g.mods.some((x) => x.id === id));
    if (g.max === 1) return [...s.filter((id) => !inGroup.includes(id)), m.id];
    return inGroup.length >= g.max ? s : [...s, m.id];
  });
  const extra = item.groups.flatMap((g) => g.mods).filter((m) => sel.includes(m.id)).reduce((s, m) => s + m.price, 0);
  const missing = item.groups.some((g) => sel.filter((id) => g.mods.some((x) => x.id === id)).length < g.min);
  return (
    <Modal title={item.name} onClose={onClose}>
      {item.desc && <p className="-mt-1 mb-4 text-sm text-[var(--muted)]">{item.desc}</p>}
      <div className="space-y-4">
        {item.groups.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{g.name}{g.max > 1 ? " (multiple)" : ""}</div>
            <div className="flex flex-wrap gap-2">
              {g.mods.map((m) => (
                <button key={m.id} onClick={() => toggle(g, m)} className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${sel.includes(m.id) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-[var(--border)] bg-white"}`}>
                  {m.name}{m.price > 0 && <span className="ml-1 text-xs text-[var(--muted)]">+{fmt(m.price)}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special instruction (optional)" maxLength={80} className="input" />
      </div>
      <button disabled={missing} onClick={() => onAdd(sel, note.trim())} className="btn-primary btn-lg mt-5 w-full">Add · {fmt(item.price + extra)}</button>
    </Modal>
  );
}

function TablePicker({ data, current, onPick, onClose, openOrders, onOpenOrder }: {
  data: PosData; current: number | null; onClose: () => void; onPick: (t: PosData["tables"][number]) => void;
  openOrders: PosData["openOrders"]; onOpenOrder: (id: number) => void;
}) {
  const sections = [...new Set(data.tables.map((t) => t.section))];
  return (
    <Modal title="Select table" onClose={onClose} wide>
      {sections.map((s) => (
        <div key={s} className="mb-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{s}</div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
            {data.tables.filter((t) => t.section === s).map((t) => (
              <button key={t.id} onClick={() => onPick(t)} className={`rounded-xl border p-3 text-left transition hover:shadow-md ${t.order ? "border-amber-300 bg-amber-50" : current === t.id ? "border-brand-500 bg-brand-50" : "border-[var(--border)] bg-white"}`}>
                <div className="flex items-center justify-between"><span className="text-base font-semibold">{t.name}</span><span className="text-[11px] text-[var(--muted)]">{t.capacity} seats</span></div>
                {t.order ? <div className="mt-1 text-xs"><span className="font-semibold text-amber-800">{fmt(t.order.total)}</span><span className="text-[var(--muted)]"> · {minutesAgo(t.order.createdAt)}m</span></div> : <div className="mt-1 text-xs text-emerald-700">Free</div>}
              </button>
            ))}
          </div>
        </div>
      ))}
      {openOrders.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Open takeaway / delivery orders</div>
          <div className="space-y-1.5">
            {openOrders.map((o) => (
              <button key={o.id} onClick={() => onOpenOrder(o.id)} className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-stone-50">
                <span>#{o.orderNo} · {o.type.replace("_", " ")} {o.customerName && `· ${o.customerName}`}</span>
                <span className="flex items-center gap-2"><span className={`badge ${STATUS_STYLE[o.status] ?? ""}`}>{o.status.replace("_", " ")}</span><b>{fmt(o.total)}</b></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CustomerDialog({ onClose, onPick, onManual, customer, name, phone, loyaltyEnabled }: {
  onClose: () => void; onPick: (c: Customer) => void; onManual: (name: string, phone: string) => void; customer: Customer | null; name: string; phone: string; loyaltyEnabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[]>([]);
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone);
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(async () => { const r = await searchCustomersAction(q); if (r.ok && id === seq.current) setRows(r.customers); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title="Customer" onClose={onClose}>
      <div className="relative"><Phone size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by phone or name" className="input pl-9" /></div>
      <div className="mt-2 space-y-1">
        {rows.map((c) => (
          <button key={c.id} onClick={() => onPick(c)} className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-stone-50">
            <span><b>{c.name || "Unnamed"}</b> <span className="text-[var(--muted)]">{c.phone}</span></span>
            <span className="text-xs text-[var(--muted)]">{c.visits} visits{loyaltyEnabled && ` · ${c.loyaltyPoints} pts`}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">New / walk-in</div>
        <div className="grid grid-cols-2 gap-2">
          <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Name" className="input" />
          <input value={p} onChange={(e) => setP(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder="Phone" className="input" />
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => onManual(n.trim(), p)} className="btn-primary flex-1">Use these details</button>
          {(customer || name || phone) && <button onClick={() => onManual("", "")} className="btn-ghost">Clear</button>}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">A phone number adds the customer to your CRM and earns loyalty points automatically.</p>
      </div>
    </Modal>
  );
}

function DiscountDialog({ canOverride, kind, value, reason, couponCode, subtotal, points, redeem, loyaltyEnabled, onClose, onApply }: {
  canOverride: boolean; kind: "none" | "percent" | "flat"; value: number; reason: string; couponCode: string | null; couponAmt: number; subtotal: number;
  points: number; redeem: number; loyaltyEnabled: boolean; onClose: () => void;
  onApply: (v: { kind: "none" | "percent" | "flat"; value: number; reason: string; coupon: string | null; couponAmt: number; redeem: number }) => void;
}) {
  const [k, setK] = useState(kind);
  const [v, setV] = useState(kind === "flat" ? value / 100 : value);
  const [r, setR] = useState(reason);
  const [code, setCode] = useState(couponCode ?? "");
  const [cAmt, setCAmt] = useState(0);
  const [cMsg, setCMsg] = useState<string | null>(null);
  const [rd, setRd] = useState(redeem);
  const maxRedeem = Math.min(points, Math.floor(subtotal / 100));
  async function check() {
    if (!code.trim()) { setCAmt(0); setCMsg(null); return; }
    const res = await checkCouponAction(code, subtotal);
    if (res.ok) { setCAmt(res.amount); setCMsg(`${res.code}: −${fmt(res.amount)}`); } else { setCAmt(0); setCMsg(res.error); }
  }
  return (
    <Modal title="Discount & offers" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <div className="label">Manual discount {!canOverride && <span className="text-amber-700">(cashiers: up to 10% / ₹50)</span>}</div>
          <div className="flex gap-2">
            <div className="flex rounded-lg bg-stone-100 p-0.5 text-sm">
              {([["none", "None"], ["percent", "%"], ["flat", "₹"]] as const).map(([id, l]) => (
                <button key={id} onClick={() => setK(id)} className={`rounded-md px-3 py-1.5 font-medium ${k === id ? "bg-white shadow-sm" : "text-stone-500"}`}>{l}</button>
              ))}
            </div>
            {k !== "none" && <input type="number" min={0} value={v || ""} onChange={(e) => setV(Number(e.target.value))} className="input flex-1" placeholder={k === "percent" ? "e.g. 10" : "e.g. 20"} />}
          </div>
          {k !== "none" && <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Reason (staff meal, regular customer…)" className="input mt-2" />}
        </div>
        <div>
          <div className="label flex items-center gap-1"><Tag size={12} /> Coupon code</div>
          <div className="flex gap-2"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="input flex-1 uppercase" placeholder="WELCOME10" /><button onClick={check} className="btn-ghost">Check</button></div>
          {cMsg && <p className={`mt-1 text-xs ${cAmt > 0 ? "text-emerald-700" : "text-red-600"}`}>{cMsg}</p>}
        </div>
        {loyaltyEnabled && (
          <div>
            <div className="label">Redeem loyalty points (1 pt = ₹1) · available {points}</div>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={maxRedeem} value={rd || ""} onChange={(e) => setRd(Math.min(Math.max(Number(e.target.value), 0), maxRedeem))} className="input w-28" />
              <button onClick={() => setRd(maxRedeem)} className="btn-ghost btn-sm">Max</button>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => onApply({ kind: "none", value: 0, reason: "", coupon: null, couponAmt: 0, redeem: 0 })} className="btn-ghost">Remove all</button>
          <button onClick={() => onApply({ kind: k, value: k === "flat" ? Math.round(v * 100) : Math.round(v), reason: r, coupon: cAmt > 0 ? code.trim() : null, couponAmt: cAmt, redeem: rd })} className="btn-primary flex-1">Apply</button>
        </div>
      </div>
    </Modal>
  );
}

type PayRow = { method: "cash" | "upi" | "card" | "wallet" | "online" | "due"; amount: number };
function PayDialog({ due, upiId, outletName, orderNo, onClose, onPay }: { due: number; upiId: string; outletName: string; orderNo: string; onClose: () => void; onPay: (rows: PayRow[]) => Promise<void> }) {
  const [rows, setRows] = useState<PayRow[]>([{ method: "cash", amount: due }]);
  const [paying, setPaying] = useState(false);
  const [qr, setQr] = useState("");
  const entered = rows.reduce((s, r) => s + r.amount, 0);
  const remaining = due - entered;
  const upiRow = rows.find((r) => r.method === "upi");
  useEffect(() => {
    if (!upiId || !upiRow) { setQr(""); return; }
    const url = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(outletName)}&am=${(upiRow.amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent("Order " + orderNo)}`;
    void QRCode.toDataURL(url, { margin: 1, width: 200 }).then(setQr);
  }, [upiId, upiRow, outletName, orderNo]);
  const set = (i: number, patch: Partial<PayRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const cashRow = rows.find((r) => r.method === "cash");
  const change = cashRow && entered > due ? Math.min(entered - due, cashRow.amount) : 0;
  return (
    <Modal title={`Collect payment · ${fmt(due)}`} onClose={onClose}>
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select value={r.method} onChange={(e) => set(i, { method: e.target.value as PayRow["method"] })} className="input w-28">
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="online">Online (paid)</option><option value="wallet">Wallet</option><option value="due">Credit / due</option>
            </select>
            <div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">₹</span>
              <input type="number" min={0} step="0.01" value={r.amount / 100 || ""} onChange={(e) => set(i, { amount: Math.round(Number(e.target.value) * 100) })} className="input pl-7" /></div>
            {rows.length > 1 && <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded-md p-2 text-stone-400 hover:bg-stone-100"><X size={16} /></button>}
          </div>
        ))}
      </div>
      {rows.some((r) => r.method === "cash") && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[due, Math.ceil(due / 10000) * 10000, Math.ceil(due / 50000) * 50000, Math.ceil(due / 100000) * 100000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
            <button key={v} onClick={() => setRows((rs) => rs.map((r) => (r.method === "cash" ? { ...r, amount: v } : r)))} className="btn-ghost btn-sm">{v === due ? "Exact" : fmt(v)}</button>
          ))}
        </div>
      )}
      {remaining > 0 && <button onClick={() => setRows((rs) => [...rs, { method: rs.some((r) => r.method === "cash") ? "upi" : "cash", amount: remaining }])} className="btn-ghost btn-sm mt-3"><Plus size={14} /> Split — add {fmt(remaining)}</button>}
      {qr && <div className="mt-4 flex items-center gap-3 rounded-lg bg-stone-50 p-3"><img src={qr} alt="UPI QR" width={110} height={110} /><div className="text-xs text-[var(--muted)]">Customer scans to pay <b>{fmt(upiRow!.amount)}</b> to {upiId}. Confirm once the payment shows in your UPI app.</div></div>}
      {upiRow && !upiId && <p className="mt-3 text-xs text-amber-700">Add your UPI ID in Settings → Outlet to show a QR code here.</p>}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
        <span>{remaining > 0 ? <>Still due <b className="text-red-600">{fmt(remaining)}</b></> : <>Fully covered</>}</span>
        {change > 0 && <span className="font-semibold text-emerald-700">Return change {fmt(change)}</span>}
      </div>
      <button disabled={paying || entered <= 0} onClick={async () => { setPaying(true); try { await onPay(rows.filter((r) => r.amount > 0)); } finally { setPaying(false); } }} className="btn-primary btn-lg mt-4 w-full">
        {paying ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} {remaining > 0 ? "Record part payment" : "Complete payment"}
      </button>
    </Modal>
  );
}

function ReasonDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <label className="label">Reason (recorded in the audit log)</label>
      <div className="flex flex-wrap gap-1.5">{["Customer changed mind", "Wrong item punched", "Out of stock", "Duplicate order", "Kitchen delay"].map((x) => <button key={x} onClick={() => setReason(x)} className="btn-ghost btn-sm">{x}</button>)}</div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-2" placeholder="Reason" autoFocus />
      <button disabled={!reason.trim() || busy} onClick={async () => { setBusy(true); try { await onConfirm(reason); } finally { setBusy(false); } }} className="btn-danger btn-lg mt-4 w-full">Confirm cancel</button>
    </Modal>
  );
}

