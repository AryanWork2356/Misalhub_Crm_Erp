// Pure pricing maths shared by the server (authoritative) and the POS screen (live preview). No imports from server-only code.

export type PriceLine = { lineTotal: number; taxPct: number | string };

export type TotalsInput = {
  lines: PriceLine[];
  /** discount in paise already resolved from percent / coupon / loyalty (capped to subtotal here) */
  discount: number;
  deliveryFee?: number;
  tip?: number;
  taxInclusive: boolean;
  gstOn: boolean;
};

export type Totals = { subtotal: number; discount: number; tax: number; roundOff: number; total: number; taxBreakup: { rate: number; taxable: number; tax: number }[] };

export function computeTotals(i: TotalsInput): Totals {
  const subtotal = i.lines.reduce((s, l) => s + l.lineTotal, 0);
  const discount = Math.min(Math.max(i.discount, 0), subtotal);
  let net = 0;
  let tax = 0;
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of i.lines) {
    const share = subtotal > 0 ? (l.lineTotal / subtotal) * discount : 0;
    const lineNet = l.lineTotal - share;
    const rate = i.gstOn ? Number(l.taxPct) : 0;
    const lineTax = i.taxInclusive ? lineNet - lineNet / (1 + rate / 100) : lineNet * (rate / 100);
    const taxable = i.taxInclusive ? lineNet - lineTax : lineNet;
    net += lineNet;
    tax += lineTax;
    const b = byRate.get(rate) ?? { taxable: 0, tax: 0 };
    b.taxable += taxable;
    b.tax += lineTax;
    byRate.set(rate, b);
  }
  const taxR = Math.round(tax);
  const base = i.taxInclusive ? Math.round(net) : Math.round(net) + taxR;
  const raw = base + (i.deliveryFee ?? 0) + (i.tip ?? 0);
  const total = Math.round(raw / 100) * 100;
  return {
    subtotal, discount, tax: taxR, roundOff: total - raw, total,
    taxBreakup: [...byRate.entries()].filter(([r]) => r > 0).map(([rate, v]) => ({ rate, taxable: Math.round(v.taxable), tax: Math.round(v.tax) })).sort((a, b) => a.rate - b.rate),
  };
}

export type CouponLike = { kind: "percent" | "flat"; value: number; minOrder: number; maxDiscount: number | null };

export function couponAmount(c: CouponLike, subtotal: number): number {
  if (subtotal < c.minOrder) return 0;
  let d = c.kind === "percent" ? Math.round((subtotal * c.value) / 100) : c.value;
  if (c.maxDiscount != null) d = Math.min(d, c.maxDiscount);
  return Math.min(d, subtotal);
}

export function manualDiscount(kind: "none" | "percent" | "flat", value: number, subtotal: number): number {
  if (kind === "percent") return Math.round((subtotal * Math.min(value, 100)) / 100);
  if (kind === "flat") return Math.min(value, subtotal);
  return 0;
}
