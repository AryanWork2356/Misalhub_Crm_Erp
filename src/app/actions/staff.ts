"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser, writeAudit } from "@/lib/auth";
import { isHeadOffice } from "@/lib/permissions";
import { businessDate } from "@/lib/dates";
import type { UserRole } from "@/db/schema";
import type { Result } from "./pos";

async function run<T extends object>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, ...(await fn()) }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e;
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input" };
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Which roles a given actor may create or edit. Prevents managers promoting themselves or others. */
const CAN_MANAGE: Record<UserRole, UserRole[]> = {
  owner: ["admin", "franchisee", "manager", "cashier", "waiter", "kitchen", "delivery"],
  admin: ["franchisee", "manager", "cashier", "waiter", "kitchen", "delivery"],
  franchisee: ["manager", "cashier", "waiter", "kitchen", "delivery"],
  manager: ["cashier", "waiter", "kitchen", "delivery"],
  cashier: [], waiter: [], kitchen: [], delivery: [],
};

const userSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(2, "Name is required").max(60),
  phone: z.string().transform((s) => s.replace(/\D/g, "").slice(-10)).pipe(z.string().length(10, "Enter a 10-digit mobile")),
  role: z.enum(schema.USER_ROLES),
  outletId: z.number().int().nullable(),
  salaryRupees: z.number().min(0).max(1000000),
  active: z.boolean(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN must be 4–6 digits").optional().or(z.literal("")),
  password: z.string().min(8, "Password needs at least 8 characters").optional().or(z.literal("")),
});

export async function saveUserAction(input: z.input<typeof userSchema>) {
  return run(async () => {
    const { user: actor } = await requireUser("staff");
    const v = userSchema.parse(input);
    const allowed = CAN_MANAGE[actor.role];
    if (!allowed.includes(v.role)) throw new Error("You can't create or edit that role");
    const db = await getDb();
    // Non-head-office actors are confined to their own outlet.
    const outletId = isHeadOffice(actor.role) ? v.outletId : actor.outletId;
    if (!outletId && !["owner", "admin"].includes(v.role)) throw new Error("Pick an outlet for this user");
    if (!v.id && !v.pin && !v.password) throw new Error("Set a PIN or password so they can sign in");
    if (["manager", "franchisee", "admin"].includes(v.role) && !v.password && !v.id) throw new Error("Managers need a password");

    const vals = { name: v.name, phone: v.phone, role: v.role, outletId, monthlySalary: Math.round(v.salaryRupees * 100), active: v.active };
    const creds: { pinHash?: string; passwordHash?: string } = {};
    if (v.pin) creds.pinHash = await bcrypt.hash(v.pin, 10);
    if (v.password) creds.passwordHash = await bcrypt.hash(v.password, 10);

    if (v.id) {
      const [target] = await db.select().from(schema.users).where(eq(schema.users.id, v.id));
      if (!target) throw new Error("User not found");
      if (!allowed.includes(target.role)) throw new Error("You can't edit this user");
      if (!isHeadOffice(actor.role) && target.outletId !== actor.outletId) throw new Error("User belongs to another outlet");
      await db.update(schema.users).set({ ...vals, ...creds }).where(eq(schema.users.id, v.id));
    } else {
      await db.insert(schema.users).values({ ...vals, ...creds });
    }
    await writeAudit(actor.id, outletId, v.id ? "edit_user" : "add_user", "user", v.id ?? "", `${v.name} (${v.role})${v.pin || v.password ? " credentials set" : ""}`);
    revalidatePath("/staff");
    return {};
  });
}

export async function clockStatusAction() {
  return run(async () => {
    const { user } = await requireUser();
    const db = await getDb();
    const [a] = await db.select().from(schema.attendance).where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.workDate, businessDate())));
    return { state: !a?.clockIn ? ("out" as const) : a.clockOut ? ("done" as const) : ("in" as const) };
  });
}

/** Self clock-in / clock-out for whoever is signed in. */
export async function clockAction() {
  return run(async () => {
    const { user } = await requireUser();
    const db = await getDb();
    const date = businessDate();
    const [a] = await db.select().from(schema.attendance).where(and(eq(schema.attendance.userId, user.id), eq(schema.attendance.workDate, date)));
    if (!a) {
      await db.insert(schema.attendance).values({ userId: user.id, outletId: user.outletId, workDate: date, clockIn: new Date(), status: "present" });
      return { state: "in" as const };
    }
    if (!a.clockOut) {
      await db.update(schema.attendance).set({ clockOut: new Date() }).where(eq(schema.attendance.id, a.id));
      return { state: "done" as const };
    }
    throw new Error("You already clocked out today");
  });
}

export async function markAttendanceAction(userId: number, date: string, status: "present" | "absent" | "half_day" | "leave") {
  return run(async () => {
    const { user: actor } = await requireUser("staff");
    const outletId = await currentOutletId(actor);
    const d = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(date);
    const db = await getDb();
    const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!target || (target.outletId !== outletId && !isHeadOffice(actor.role))) throw new Error("User not found");
    await db.insert(schema.attendance).values({ userId, outletId: target.outletId, workDate: d, status, clockIn: status === "present" ? new Date(`${d}T09:00:00+05:30`) : null })
      .onConflictDoUpdate({ target: [schema.attendance.userId, schema.attendance.workDate], set: { status } });
    revalidatePath("/staff");
    return {};
  });
}
