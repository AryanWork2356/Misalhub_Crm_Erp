import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { saveOrder } from "@/lib/orders";
import { clientIp, corsHeaders, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  outlet: z.string().trim().toUpperCase().max(8),
  type: z.enum(["takeaway", "delivery", "dine_in"]),
  table: z.string().trim().max(10).optional(),
  name: z.string().trim().min(2, "Please enter your name").max(80),
  phone: z.string().transform((s) => s.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10, "Enter a 10-digit mobile number")),
  address: z.string().trim().max(300).optional(),
  distance: z.enum(["near", "far"]).optional(),
  notes: z.string().trim().max(300).optional(),
  items: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(1).max(20), modifierIds: z.array(z.number().int()).max(12).optional(), notes: z.string().max(100).optional() })).min(1, "Your cart is empty").max(40),
  couponCode: z.string().trim().toUpperCase().max(20).optional(),
  // honeypot: real customers never fill this in
  website: z.string().max(0).optional(),
});

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

  if (!rateLimit(`order:${clientIp(req)}`, 6, 10 * 60_000)) return json({ error: "Too many orders from this device. Please try again in a few minutes." }, 429);
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, 400);
  const v = parsed.data;

  const db = await getDb();
  const [outlet] = await db.select().from(schema.outlets).where(and(eq(schema.outlets.code, v.outlet), eq(schema.outlets.active, true)));
  if (!outlet) return json({ error: "Outlet not found" }, 404);
  if (v.type === "delivery" && !v.address) return json({ error: "Delivery address is required" }, 400);

  let tableId: number | null = null;
  if (v.type === "dine_in") {
    const [t] = await db.select().from(schema.diningTables).where(and(eq(schema.diningTables.outletId, outlet.id), eq(schema.diningTables.name, v.table ?? ""), eq(schema.diningTables.active, true)));
    if (!t) return json({ error: "Unknown table — please scan the QR on your table again." }, 400);
    tableId = t.id;
  }

  try {
    const r = await saveOrder({
      outletId: outlet.id, userId: null, type: v.type, channel: v.type === "dine_in" ? "qr" : "website", tableId, customerName: v.name, customerPhone: v.phone,
      deliveryAddress: v.address ?? "", deliveryFee: v.type === "delivery" ? (v.distance === "far" ? outlet.deliveryFeeFar : outlet.deliveryFeeNear) : 0,
      lines: v.items, couponCode: v.couponCode || null, notes: v.notes ?? "",
    });
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, r.orderId));
    return json({ ok: true, orderId: r.orderId, orderNo: r.orderNo, total: o.total, upiId: outlet.upiId || null, outletName: outlet.name });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not place the order" }, 400);
  }
}
