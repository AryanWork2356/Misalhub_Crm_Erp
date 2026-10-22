/** Money is stored in paise. */
export const toPaise = (rupees: number | string) => Math.round(Number(rupees) * 100);
export const rupees = (paise: number) => paise / 100;

export function fmt(paise: number, opts: { decimals?: boolean } = {}): string {
  const v = paise / 100;
  const showDecimals = opts.decimals ?? !Number.isInteger(v);
  return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: showDecimals ? 2 : 0, maximumFractionDigits: 2 });
}

/** Compact for dashboards: ₹1.2L, ₹45K */
export function fmtCompact(paise: number): string {
  const v = paise / 100;
  const abs = Math.abs(v);
  if (abs >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (abs >= 10000) return `₹${(v / 1000).toFixed(1)}K`;
  return fmt(paise);
}
