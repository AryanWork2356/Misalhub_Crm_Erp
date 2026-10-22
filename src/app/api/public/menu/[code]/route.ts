import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clientIp, corsHeaders, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Read-only public menu for an outlet (prices in rupees) — usable by the marketing website. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "public, max-age=60" };
  if (!rateLimit(`menu:${clientIp(req)}`, 60, 60_000)) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers });
  const { code } = await params;
  const db = await getDb();
  const [outlet] = await db.select().from(schema.outlets).where(and(eq(schema.outlets.code, code.toUpperCase()), eq(schema.outlets.active, true)));
  if (!outlet) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
  const cats = await db.select().from(schema.categories).where(eq(schema.categories.active, true)).orderBy(asc(schema.categories.sortOrder));
  const items = await db.select().from(schema.items).where(eq(schema.items.active, true)).orderBy(asc(schema.items.sortOrder));
  const ov = await db.select().from(schema.outletItems).where(eq(schema.outletItems.outletId, outlet.id));
  const body = {
    outlet: { code: outlet.code, name: outlet.name, address: outlet.address, phone: outlet.phone, open: outlet.openTime, close: outlet.closeTime },
    categories: cats.map((c) => ({
      id: c.id, name: c.name,
      items: items.filter((i) => i.categoryId === c.id).map((i) => {
        const o = ov.find((x) => x.itemId === i.id);
        return { id: i.id, name: i.name, description: i.description, price: (o?.price ?? i.price) / 100, veg: i.isVeg, bestseller: i.isBestseller, jain: i.jainAvailable, available: o?.available ?? true };
      }),
    })),
  };
  return new Response(JSON.stringify(body), { headers });
}
