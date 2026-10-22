import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { User, UserRole } from "@/db/schema";
import { can, HOME, isHeadOffice, type Module } from "./permissions";

const COOKIE = "mh_session";
const MAX_AGE = 60 * 60 * 12; // one shift
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!s || s.length < 32)) throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters in production");
  return new TextEncoder().encode(s || "dev-only-insecure-secret-change-me-please-32chars");
};

export type Session = { userId: number; role: UserRole; outletId: number | null; name: string };

export async function createSession(user: User) {
  const token = await new SignJWT({ role: user.role, outletId: user.outletId, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), role: payload.role as UserRole, outletId: (payload.outletId as number | null) ?? null, name: String(payload.name) };
  } catch {
    return null;
  }
}

// Simple brute-force guard (per phone, in-memory): 5 failures locks that phone for 5 minutes.
const attempts = new Map<string, { n: number; until: number }>();
function guard(key: string) {
  const a = attempts.get(key);
  if (a && a.until > Date.now() && a.n >= 5) throw new Error("Too many attempts. Try again in a few minutes.");
}
function fail(key: string) {
  const a = attempts.get(key);
  const n = a && a.until > Date.now() ? a.n + 1 : 1;
  attempts.set(key, { n, until: Date.now() + 5 * 60_000 });
}

const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4wQXQ9n8Xk9o5lOQJm2eQmO0eQ6W";

export async function verifyLogin(phone: string, secretValue: string, mode: "password" | "pin"): Promise<User> {
  const key = phone.trim();
  guard(key);
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(and(eq(schema.users.phone, key), eq(schema.users.active, true))).limit(1);
  const hash = mode === "pin" ? user?.pinHash : user?.passwordHash;
  // Always run a compare so unknown users cost the same time as wrong passwords.
  const ok = await bcrypt.compare(secretValue, hash ?? DUMMY_HASH);
  if (!user || !hash || !ok) { fail(key); throw new Error(`Invalid phone or ${mode}`); }
  attempts.delete(key);
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
  return user;
}

/** For server components/actions: returns the logged-in user or redirects to /login. */
export async function requireUser(mod?: Module): Promise<{ user: User; session: Session }> {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  if (!user || !user.active) redirect("/login");
  if (mod && !can(user.role, mod)) redirect(HOME[user.role]);
  return { user, session };
}

/**
 * Outlet the user may operate on. Head office can pick any outlet via the `mh_outlet` cookie;
 * everyone else is pinned to their own outlet.
 */
export async function currentOutletId(user: User): Promise<number> {
  const db = await getDb();
  if (!isHeadOffice(user.role)) {
    if (!user.outletId) throw new Error("User is not assigned to an outlet");
    return user.outletId;
  }
  const chosen = Number((await cookies()).get("mh_outlet")?.value);
  if (chosen) {
    const [o] = await db.select({ id: schema.outlets.id }).from(schema.outlets).where(and(eq(schema.outlets.id, chosen), eq(schema.outlets.active, true)));
    if (o) return o.id;
  }
  const [first] = await db.select({ id: schema.outlets.id }).from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id).limit(1);
  return first.id;
}

export async function writeAudit(userId: number | null, outletId: number | null, action: string, entity = "", entityId: string | number = "", detail = "") {
  const db = await getDb();
  await db.insert(schema.auditLogs).values({ userId, outletId, action, entity, entityId: String(entityId), detail });
}
