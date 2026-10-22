"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, UserPlus } from "lucide-react";
import { fmt } from "@/lib/money";
import { fmtDateTime } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/permissions";
import type { UserRole } from "@/db/schema";
import { Modal } from "@/components/modal";
import { markAttendanceAction, saveUserAction } from "../../actions/staff";

type S = { id: number; name: string; phone: string; role: UserRole; outletId: number | null; salary: number; active: boolean; lastLogin: string | null };

const MANAGEABLE: Record<UserRole, UserRole[]> = {
  owner: ["admin", "franchisee", "manager", "cashier", "waiter", "kitchen", "delivery"], admin: ["franchisee", "manager", "cashier", "waiter", "kitchen", "delivery"],
  franchisee: ["manager", "cashier", "waiter", "kitchen", "delivery"], manager: ["cashier", "waiter", "kitchen", "delivery"], cashier: [], waiter: [], kitchen: [], delivery: [],
};

export function TeamManager({ staff, actorRole, outlets, defaultOutletId }: { staff: S[]; actorRole: UserRole; outlets: { id: number; name: string }[]; defaultOutletId: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<S> | null>(null);
  const allowed = MANAGEABLE[actorRole];
  return (
    <>
      <div className="mb-3 flex justify-end"><button onClick={() => setEdit({ role: allowed.includes("cashier") ? "cashier" : allowed[0], outletId: defaultOutletId, active: true, salary: 0 })} className="btn-primary"><UserPlus size={15} /> Add staff</button></div>
      <div className="card overflow-x-auto"><table className="w-full min-w-[640px]">
        <thead className="border-b border-[var(--border)]"><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Mobile</th><th className="th text-right">Salary</th><th className="th">Last login</th><th className="th" /></tr></thead>
        <tbody>{staff.map((s) => (
          <tr key={s.id} className={`border-b border-stone-100 last:border-0 ${!s.active ? "opacity-50" : ""}`}>
            <td className="td font-medium">{s.name}{!s.active && <span className="badge ml-2 bg-stone-200 text-stone-600">inactive</span>}</td><td className="td">{ROLE_LABEL[s.role]}</td><td className="td text-[var(--muted)]">{s.phone}</td>
            <td className="td text-right tabular-nums">{s.salary ? fmt(s.salary) : "—"}</td><td className="td text-xs text-[var(--muted)]">{s.lastLogin ? fmtDateTime(s.lastLogin) : "never"}</td>
            <td className="td text-right">{allowed.includes(s.role) && <button onClick={() => setEdit(s)} className="rounded-md p-1.5 hover:bg-stone-100" aria-label={`Edit ${s.name}`}><Pencil size={15} /></button>}</td></tr>))}</tbody></table></div>
      {edit && <UserDialog init={edit} allowed={allowed} outlets={outlets} canPickOutlet={outlets.length > 1} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />}
    </>
  );
}

function UserDialog({ init, allowed, outlets, canPickOutlet, onClose, onSaved }: { init: Partial<S>; allowed: UserRole[]; outlets: { id: number; name: string }[]; canPickOutlet: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: init.name ?? "", phone: init.phone ?? "", role: (init.role ?? allowed[0]) as UserRole, outletId: init.outletId ?? outlets[0]?.id ?? null, salary: String((init.salary ?? 0) / 100), active: init.active ?? true, pin: "", password: "" });
  const needsPassword = ["manager", "franchisee", "admin"].includes(f.role);
  return (
    <Modal title={init.id ? `Edit ${init.name}` : "Add staff"} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Full name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></div>
        <div><label className="label">Mobile (login ID)</label><input className="input" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></div>
        <div><label className="label">Role</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as UserRole })}>{(Object.keys(ROLE_LABEL) as UserRole[]).filter((r) => allowed.includes(r)).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
        {canPickOutlet && <div><label className="label">Outlet</label><select className="input" value={f.outletId ?? ""} onChange={(e) => setF({ ...f, outletId: Number(e.target.value) })}>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
        <div><label className="label">Monthly salary (₹)</label><input type="number" min={0} className="input" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} /></div>
        <div><label className="label">{init.id ? "New PIN (leave blank to keep)" : "PIN (4–6 digits)"}</label><input className="input" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} /></div>
        {(needsPassword || init.id) && <div><label className="label">{init.id ? "New password (blank = keep)" : "Password (8+ chars)"}</label><input type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></div>}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-brand-500" /> Active (can sign in)</label>
      </div>
      <button onClick={async () => {
        const r = await saveUserAction({ id: init.id, name: f.name, phone: f.phone, role: f.role, outletId: f.outletId, salaryRupees: Number(f.salary) || 0, active: f.active, pin: f.pin, password: f.password });
        if (!r.ok) return void toast.error(r.error.includes("unique") ? "That mobile number is already registered" : r.error);
        toast.success("Saved"); onSaved();
      }} className="btn-primary btn-lg mt-5 w-full">Save</button>
    </Modal>
  );
}

const CODE: Record<string, { l: string; c: string }> = { present: { l: "P", c: "bg-emerald-100 text-emerald-800" }, absent: { l: "A", c: "bg-red-100 text-red-700" }, half_day: { l: "½", c: "bg-amber-100 text-amber-800" }, leave: { l: "L", c: "bg-sky-100 text-sky-800" } };
const NEXT: Record<string, "present" | "absent" | "half_day" | "leave"> = { none: "present", present: "half_day", half_day: "leave", leave: "absent", absent: "present" };

export function AttendanceGrid({ month, days, today, crew, rows }: { month: string; days: number; today: string; crew: { id: number; name: string }[]; rows: { userId: number; date: string; status: string }[] }) {
  const router = useRouter();
  return (
    <div className="card overflow-x-auto p-3">
      <p className="mb-2 text-xs text-[var(--muted)]">Click a day to cycle: Present → Half-day → Leave → Absent.</p>
      <table className="text-xs"><thead><tr><th className="pr-3 text-left">Staff</th>{Array.from({ length: days }, (_, i) => <th key={i} className="w-7 text-center font-medium text-[var(--muted)]">{i + 1}</th>)}</tr></thead>
        <tbody>{crew.map((c) => (
          <tr key={c.id}><td className="whitespace-nowrap py-0.5 pr-3 font-medium">{c.name}</td>
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const st = rows.find((r) => r.userId === c.id && r.date === date)?.status ?? "none";
              const future = date > today;
              return <td key={i} className="p-0.5"><button disabled={future} aria-label={`${c.name} ${date}`} onClick={async () => { const r = await markAttendanceAction(c.id, date, NEXT[st]); if (!r.ok) return void toast.error(r.error); router.refresh(); }}
                className={`h-6 w-6 rounded text-[10px] font-semibold ${CODE[st]?.c ?? "bg-stone-100 text-stone-300"} disabled:opacity-30`}>{CODE[st]?.l ?? "·"}</button></td>;
            })}</tr>))}</tbody></table>
    </div>
  );
}
