"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  LayoutDashboard, ReceiptText, ClipboardList, ChefHat, UtensilsCrossed, Boxes, Users, BarChart3, UserCog, Wallet,
  Building2, Settings, Bike, Landmark, Megaphone, Sparkles, Menu as MenuIcon, X, LogOut, Store, Clock,
} from "lucide-react";
import { logoutAction, switchOutletAction } from "../actions/auth";
import { clockAction, clockStatusAction } from "../actions/staff";
import { toast } from "sonner";
import type { Module } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/permissions";
import type { UserRole } from "@/db/schema";

const NAV: { href: string; label: string; mod: Module; icon: React.ComponentType<{ size?: number }> }[] = [
  { href: "/dashboard", label: "Dashboard", mod: "dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", mod: "pos", icon: ReceiptText },
  { href: "/orders", label: "Orders", mod: "orders", icon: ClipboardList },
  { href: "/kds", label: "Kitchen", mod: "kds", icon: ChefHat },
  { href: "/delivery", label: "Delivery", mod: "delivery", icon: Bike },
  { href: "/menu", label: "Menu", mod: "menu", icon: UtensilsCrossed },
  { href: "/inventory", label: "Inventory", mod: "inventory", icon: Boxes },
  { href: "/customers", label: "Customers", mod: "customers", icon: Users },
  { href: "/marketing", label: "Marketing", mod: "marketing", icon: Megaphone },
  { href: "/reports", label: "Reports", mod: "reports", icon: BarChart3 },
  { href: "/insights", label: "Insights", mod: "insights", icon: Sparkles },
  { href: "/register", label: "Cash register", mod: "register", icon: Landmark },
  { href: "/expenses", label: "Expenses", mod: "expenses", icon: Wallet },
  { href: "/staff", label: "Staff", mod: "staff", icon: UserCog },
  { href: "/franchise", label: "Franchise", mod: "franchise", icon: Building2 },
  { href: "/settings", label: "Settings", mod: "settings", icon: Settings },
];

function ClockButton({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<"in" | "out" | "done" | null>(null);
  useEffect(() => { if (enabled) void clockStatusAction().then((r) => r.ok && setState(r.state)); }, [enabled]);
  if (!enabled || !state) return null;
  return (
    <button disabled={state === "done"} onClick={async () => {
      const r = await clockAction();
      if (!r.ok) return void toast.error(r.error);
      setState(r.state); toast.success(r.state === "in" ? "Clocked in — have a great shift!" : "Clocked out — see you tomorrow");
    }} className={`mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${state === "in" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-[var(--border)] bg-white text-stone-600"} disabled:opacity-50`}>
      <Clock size={13} /> {state === "out" ? "Clock in" : state === "in" ? "On shift · Clock out" : "Shift complete"}
    </button>
  );
}

export default function Shell({ user, outlet, outlets, modules, children }: {
  user: { name: string; role: UserRole };
  outlet: { id: number; name: string };
  outlets: { id: number; name: string }[];
  modules: Module[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const items = NAV.filter((n) => modules.includes(n.mod));
  const fullBleed = pathname.startsWith("/pos") || pathname.startsWith("/kds");

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2 scrollbar-thin">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link key={href} href={href} onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-brand-50 text-brand-700" : "text-stone-600 hover:bg-stone-100"}`}>
            <Icon size={18} /> {label}
          </Link>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-lg">🍲</div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Misal Hub OS</div>
          <div className="text-[11px] text-[var(--muted)]">Restaurant suite</div>
        </div>
      </div>
      {outlets.length > 1 ? (
        <div className="px-4 pb-2">
          <label className="label flex items-center gap-1"><Store size={12} /> Outlet</label>
          <select className="input py-1.5" value={outlet.id}
            onChange={(e) => start(async () => { await switchOutletAction(Number(e.target.value)); router.refresh(); })}>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      ) : (
        <div className="px-5 pb-2 text-xs text-[var(--muted)]"><Store size={12} className="mr-1 inline" />{outlet.name}</div>
      )}
      {nav}
      <div className="border-t border-[var(--border)] p-3">
        <ClockButton enabled={user.role !== "owner" && user.role !== "admin"} />
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-stone-200 text-xs font-semibold">{user.name.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="text-[11px] text-[var(--muted)]">{ROLE_LABEL[user.role]}</div>
          </div>
          <form action={logoutAction}><button title="Sign out" className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100"><LogOut size={16} /></button></form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-[var(--border)] bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button className="absolute right-2 top-3 rounded-md p-1.5 hover:bg-stone-100" onClick={() => setOpen(false)}><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--border)] bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-stone-100"><MenuIcon size={20} /></button>
          <div className="text-sm font-semibold">Misal Hub OS</div>
          <div className="ml-auto truncate text-xs text-[var(--muted)]">{outlet.name}</div>
        </header>
        <main className={fullBleed ? "min-w-0 flex-1" : "mx-auto w-full max-w-7xl min-w-0 flex-1 p-4 sm:p-6"}>{children}</main>
      </div>
    </div>
  );
}
