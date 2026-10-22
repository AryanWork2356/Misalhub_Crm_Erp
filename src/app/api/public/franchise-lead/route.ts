import { z } from "zod";
import { getDb, schema } from "@/db";
import { clientIp, corsHeaders, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().transform((s) => s.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10, "Enter a 10-digit mobile number")),
  city: z.string().trim().max(60).optional().default(""),
  budget: z.string().trim().max(40).optional().default(""),
  message: z.string().trim().max(500).optional().default(""),
  website: z.string().max(0).optional(), // honeypot
});

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!rateLimit(`lead:${clientIp(req)}`, 4, 60 * 60_000)) return json({ error: "Too many submissions. Please try again later." }, 429);
  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid details" }, 400);
  const { website: _hp, ...lead } = parsed.data;
  void _hp;
  const db = await getDb();
  await db.insert(schema.franchiseLeads).values(lead);
  return json({ ok: true, message: "Thanks! We'll call you within 24 hours." });
}
