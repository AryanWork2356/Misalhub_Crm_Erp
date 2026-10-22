import { and, between, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { can, isHeadOffice } from "@/lib/permissions";
import { gstReport, recipeCosts, topItems } from "@/lib/reports";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => {
  let s = v == null ? "" : String(v);
  // neutralise spreadsheet formula injection from user-entered text
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(esc).join(",")).join("\n");
const rupees = (p: number) => (p / 100).toFixed(2);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !can(session.role, "reports")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "orders";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new Response("Bad date range", { status: 400 });

  const db = await getDb();
  let outletIds: number[];
  if (isHeadOffice(session.role)) {
    if (url.searchParams.get("outlet") === "all") outletIds = (await db.select({ id: schema.outlets.id }).from(schema.outlets)).map((o) => o.id);
    else {
      const chosen = Number((await cookies()).get("mh_outlet")?.value);
      const [first] = await db.select({ id: schema.outlets.id }).from(schema.outlets).orderBy(schema.outlets.id).limit(1);
      outletIds = [chosen || first.id];
    }
  } else outletIds = session.outletId ? [session.outletId] : [];
  if (!outletIds.length) return new Response("No outlet", { status: 400 });
  const scope = { outletIds, from, to };

  let body = "";
  if (type === "items") {
    const items = await topItems(scope, 1000);
    const costs = await recipeCosts(outletIds);
    body = csv([["Item", "Category", "Qty", "Revenue", "Est. cost", "Margin"], ...items.map((i) => { const c = costs.has(i.id) ? costs.get(i.id)! * i.qty : null; return [i.name, i.category, i.qty, rupees(i.revenue), c == null ? "" : rupees(c), c == null ? "" : rupees(i.revenue - c)]; })]);
  } else if (type === "gst") {
    const g = await gstReport(scope);
    body = csv([["Rate %", "Taxable value", "CGST", "SGST"], ...g.rows.map((r) => [r.rate, rupees(r.taxable), rupees(r.cgst), rupees(r.sgst)])]);
  } else {
    const rows = await db.select().from(schema.orders).where(and(inArray(schema.orders.outletId, outletIds), between(schema.orders.businessDate, from, to), ne(schema.orders.status, "cancelled"))).orderBy(schema.orders.createdAt);
    body = csv([["Date", "Order no", "Type", "Channel", "Customer", "Phone", "Subtotal", "Discount", "Delivery", "GST", "Round off", "Total", "Paid", "Status"],
      ...rows.map((o) => [o.businessDate, o.orderNo, o.type, o.channel, o.customerName, o.customerPhone, rupees(o.subtotal), rupees(o.discount), rupees(o.deliveryFee), rupees(o.tax), rupees(o.roundOff), rupees(o.total), rupees(o.paid), o.status])]);
  }
  return new Response("﻿" + body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="misalhub-${type}-${from}_${to}.csv"` } });
}
