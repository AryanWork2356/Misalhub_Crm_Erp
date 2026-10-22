import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  orderId: z.number().int(),
  rating: z.number().int().min(1).max(5),
  foodRating: z.number().int().min(1).max(5).optional(),
  serviceRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(500).optional().default(""),
});

export async function POST(req: Request) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (!rateLimit(`fb:${clientIp(req)}`, 10, 60 * 60_000)) return json({ error: "Too many submissions" }, 429);
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Please choose a rating" }, 400);
  const v = parsed.data;
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, v.orderId));
  if (!o || o.status !== "completed") return json({ error: "This order can't be reviewed yet" }, 400);
  const [existing] = await db.select({ id: schema.feedback.id }).from(schema.feedback).where(eq(schema.feedback.orderId, v.orderId));
  if (existing) return json({ error: "Thanks — feedback was already received for this order" }, 409);
  await db.insert(schema.feedback).values({ outletId: o.outletId, orderId: o.id, customerId: o.customerId, rating: v.rating, foodRating: v.foodRating, serviceRating: v.serviceRating, comment: v.comment });
  return json({ ok: true });
}
