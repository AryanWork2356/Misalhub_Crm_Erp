import type { UserRole } from "@/db/schema";

export type Module =
  | "dashboard" | "pos" | "orders" | "kds" | "menu" | "inventory" | "customers" | "reports"
  | "staff" | "expenses" | "franchise" | "settings" | "delivery" | "register" | "marketing" | "insights";

const ALL: Module[] = ["dashboard", "pos", "orders", "kds", "menu", "inventory", "customers", "reports", "staff", "expenses", "franchise", "settings", "delivery", "register", "marketing", "insights"];

export const ROLE_ACCESS: Record<UserRole, Module[]> = {
  owner: ALL,
  admin: ALL,
  franchisee: ["dashboard", "pos", "orders", "kds", "menu", "inventory", "customers", "reports", "staff", "expenses", "delivery", "register", "marketing", "insights"],
  manager: ["dashboard", "pos", "orders", "kds", "menu", "inventory", "customers", "reports", "staff", "expenses", "delivery", "register", "marketing"],
  cashier: ["pos", "orders", "customers", "register", "delivery"],
  waiter: ["pos", "orders"],
  kitchen: ["kds", "inventory"],
  delivery: ["delivery"],
};

export const HOME: Record<UserRole, string> = {
  owner: "/dashboard", admin: "/dashboard", franchisee: "/dashboard", manager: "/dashboard",
  cashier: "/pos", waiter: "/pos", kitchen: "/kds", delivery: "/delivery",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Owner", admin: "Head Office", franchisee: "Franchisee", manager: "Manager",
  cashier: "Cashier", waiter: "Waiter", kitchen: "Kitchen", delivery: "Delivery",
};

export const can = (role: UserRole, mod: Module) => ROLE_ACCESS[role].includes(mod);

/** Roles that may see every outlet. */
export const isHeadOffice = (role: UserRole) => role === "owner" || role === "admin";

/** Roles that may edit sensitive data (prices, large discounts, refunds, cancelling after KOT). */
export const isManagerUp = (role: UserRole) => ["owner", "admin", "franchisee", "manager"].includes(role);
