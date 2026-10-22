import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import FeedbackForm from "./feedback-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "How was your meal?" };

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();
  const db = await getDb();
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!o) notFound();
  const [outlet] = await db.select({ name: schema.outlets.name }).from(schema.outlets).where(eq(schema.outlets.id, o.outletId));
  const [done] = await db.select({ id: schema.feedback.id }).from(schema.feedback).where(eq(schema.feedback.orderId, orderId));
  return <FeedbackForm orderId={orderId} outletName={outlet.name} already={!!done} ready={o.status === "completed"} />;
}
