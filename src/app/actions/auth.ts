"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, getSession, verifyLogin } from "@/lib/auth";
import { HOME, isHeadOffice } from "@/lib/permissions";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";

const schemaLogin = z.object({ phone: z.string().min(10).max(15), secret: z.string().min(4).max(64), mode: z.enum(["pin", "password"]) });

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const parsed = schemaLogin.safeParse({ phone: String(formData.get("phone") ?? "").replace(/\D/g, "").slice(-10), secret: formData.get("secret"), mode: formData.get("mode") });
  if (!parsed.success) return { error: "Enter your phone number and PIN / password" };
  let dest = "/";
  try {
    const user = await verifyLogin(parsed.data.phone, parsed.data.secret, parsed.data.mode);
    await createSession(user);
    dest = HOME[user.role];
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Login failed" };
  }
  redirect(dest);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function switchOutletAction(outletId: number) {
  const session = await getSession();
  if (!session || !isHeadOffice(session.role)) return;
  const db = await getDb();
  const [o] = await db.select({ id: schema.outlets.id }).from(schema.outlets).where(eq(schema.outlets.id, outletId));
  if (!o) return;
  (await cookies()).set("mh_outlet", String(outletId), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
}
