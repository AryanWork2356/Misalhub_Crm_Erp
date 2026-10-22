"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { currentOutletId, requireUser } from "@/lib/auth";
import { addDays, businessDate } from "@/lib/dates";
import { categorySales, dailySeries, hourlySeries, lowStock, paymentSplit, profitAndLoss, splitBy, summary, topItems } from "@/lib/reports";
import { alerts, frequentPairs, menuEngineering } from "@/lib/insights";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import type { Result } from "./pos";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM = `You are the business analyst built into Misal Hub OS, the management system of Misal Hub — a Maharashtrian misal pav restaurant in Mira Road East with franchise outlets.
You are given a JSON snapshot of the outlet's recent performance. Answer the owner's question using only that data.
- Amounts in the data are rupees (already converted). Write them with the ₹ sign and Indian digit grouping.
- Be concise and concrete: lead with the answer, then 2–4 supporting numbers, then at most three specific actions.
- If the snapshot cannot answer the question, say exactly what is missing instead of guessing. Never invent figures.
- Plain text with short paragraphs or a short list. No tables, no headings.`;

const hits = new Map<number, number[]>();
function limit(userId: number) {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 20) throw new Error("You've asked 20 questions this hour. Please try again a little later.");
  hits.set(userId, [...recent, now]);
}

const r = (p: number) => Math.round(p) / 100;

async function snapshot(outletId: number) {
  const db = await getDb();
  const today = businessDate();
  const s30 = { outletIds: [outletId], from: addDays(today, -29), to: today };
  const s7 = { outletIds: [outletId], from: addDays(today, -6), to: today };
  const prev7 = { outletIds: [outletId], from: addDays(today, -13), to: addDays(today, -7) };
  const [outlet] = await db.select({ name: schema.outlets.name }).from(schema.outlets).where(eq(schema.outlets.id, outletId));
  const [sum30, sum7, sumPrev, daily, hourly, top, cats, pay, types, pl, low, pairs, eng, al] = await Promise.all([
    summary(s30), summary(s7), summary(prev7), dailySeries(s30), hourlySeries(s30), topItems(s30, 12), categorySales(s30), paymentSplit(s30), splitBy(s30, "type"),
    profitAndLoss(s30), lowStock(outletId), frequentPairs(s30, 6), menuEngineering(s30), alerts(outletId),
  ]);
  return {
    outlet: outlet.name, today, currency: "INR",
    last7Days: { sales: r(sum7.sales), orders: sum7.orders, avgOrder: r(sum7.avgOrder), discounts: r(sum7.discount), cancelled: sum7.cancelled },
    previous7Days: { sales: r(sumPrev.sales), orders: sumPrev.orders, avgOrder: r(sumPrev.avgOrder) },
    last30Days: { sales: r(sum30.sales), orders: sum30.orders, avgOrder: r(sum30.avgOrder), discounts: r(sum30.discount), gstIncluded: r(sum30.tax) },
    profitAndLoss30d: { netSales: r(pl.netSales), foodCostEstimate: r(pl.cogs), grossProfit: r(pl.gross), expenses: r(pl.expenses), netProfit: r(pl.net), expenseByCategory: pl.expenseRows.map((e) => ({ category: e.category, amount: r(e.v) })) },
    dailySales30d: daily.map((d) => ({ date: d.d, sales: r(d.sales), orders: d.orders })),
    salesByHour30d: hourly.filter((h) => h.orders > 0).map((h) => ({ hour: h.h, sales: r(h.sales), orders: h.orders })),
    topItems30d: top.map((i) => ({ item: i.name, category: i.category, qty: i.qty, revenue: r(i.revenue) })),
    categorySales30d: cats.map((c) => ({ category: c.name, qty: c.qty, revenue: r(c.revenue) })),
    paymentModes30d: pay.map((p) => ({ mode: p.k, amount: r(p.v) })),
    orderTypes30d: types.map((t) => ({ type: t.k, orders: t.n, sales: r(t.v) })),
    lowStock: low.slice(0, 10).map((l) => ({ ingredient: l.name, onHand: +l.qty.toFixed(2), minimum: l.min, unit: l.unit })),
    frequentlyBoughtTogether: pairs.map((p) => ({ a: p.a, b: p.b, ordersTogether: p.n })),
    menuEngineering: eng.map((e) => ({ item: e.name, class: e.cls, unitsSold: e.qty, marginPerUnit: r(e.margin) })),
    autoAlerts: al.map((a) => `${a.title} — ${a.detail}`),
  };
}

export async function askAssistantAction(question: string): Promise<Result<{ answer: string; model: string }>> {
  try {
    const { user } = await requireUser("insights");
    const q = z.string().trim().min(3, "Ask a question").max(500, "Keep it under 500 characters").parse(question);
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The AI assistant isn't switched on yet. Add ANTHROPIC_API_KEY to the server environment (see README) and restart." };
    limit(user.id);
    const outletId = await currentOutletId(user);
    const data = await snapshot(outletId);

    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: `Outlet data snapshot (JSON):\n${JSON.stringify(data)}\n\nQuestion: ${q}` }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "The assistant couldn't answer that question. Try rephrasing it." };
    const answer = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!answer) return { ok: false, error: "No answer came back. Please try again." };
    return { ok: true, answer, model: res.model };
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid question" };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The AI service is busy. Try again in a minute." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `AI service error (${e.status}). Try again shortly.` };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}
