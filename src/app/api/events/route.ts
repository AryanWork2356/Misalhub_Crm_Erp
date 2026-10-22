import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/auth";
import { subscribe } from "@/lib/events";
import { cookies } from "next/headers";
import { isHeadOffice } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // serverless limit; the browser reconnects automatically (EventSource) and also polls

/** Server-Sent Events stream of order changes for the signed-in user's current outlet. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  let outletId = session.outletId;
  if (isHeadOffice(session.role)) {
    const chosen = Number((await cookies()).get("mh_outlet")?.value);
    const db = await getDb();
    const [o] = chosen
      ? await db.select({ id: schema.outlets.id }).from(schema.outlets).where(and(eq(schema.outlets.id, chosen), eq(schema.outlets.active, true)))
      : await db.select({ id: schema.outlets.id }).from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id).limit(1);
    outletId = o?.id ?? null;
  }
  if (!outletId) return new Response("No outlet", { status: 400 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { cleanup(); } };
      send(`retry: 3000\n\n`);
      const unsub = subscribe((e) => { if (e.outletId === outletId) send(`data: ${JSON.stringify(e)}\n\n`); });
      const ping = setInterval(() => send(`: ping\n\n`), 25000);
      cleanup = () => { clearInterval(ping); unsub(); try { controller.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
