import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentOutletId, requireUser } from "@/lib/auth";
import { isManagerUp } from "@/lib/permissions";
import { businessDate, fmtDate, fmtDateTime } from "@/lib/dates";
import { fmt } from "@/lib/money";
import { PageHeader, Stat, Tabs, Empty } from "@/components/ui";
import { StockTable, PurchaseForm, RecipeEditor, IngredientForm, SupplierForm } from "./inventory-client";

export const metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user } = await requireUser("inventory");
  const outletId = await currentOutletId(user);
  const manager = isManagerUp(user.role);
  const tab = (await searchParams).tab ?? "stock";
  const db = await getDb();

  const stockRows = await db.select({ ing: schema.ingredients, s: schema.stock }).from(schema.stock)
    .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.stock.ingredientId)).where(and(eq(schema.stock.outletId, outletId), eq(schema.ingredients.active, true))).orderBy(asc(schema.ingredients.category), asc(schema.ingredients.name));
  const rows = stockRows.map(({ ing, s }) => ({ id: ing.id, name: ing.name, unit: ing.unit, category: ing.category, qty: Number(s.qty), min: Number(s.minQty), avgCost: s.avgCost }));
  const value = rows.reduce((a, r) => a + Math.max(r.qty, 0) * r.avgCost, 0);
  const low = rows.filter((r) => r.qty <= r.min);

  const tabs = [{ id: "stock", label: "Stock" }, ...(manager ? [{ id: "purchases", label: "Purchases" }, { id: "recipes", label: "Recipes" }] : []), { id: "log", label: "Movement log" }];
  let body: React.ReactNode;

  if (tab === "purchases" && manager) {
    const sup = await db.select().from(schema.suppliers).where(eq(schema.suppliers.active, true)).orderBy(asc(schema.suppliers.name));
    const purchases = await db.select({ p: schema.purchases, supplier: schema.suppliers.name }).from(schema.purchases).leftJoin(schema.suppliers, eq(schema.suppliers.id, schema.purchases.supplierId))
      .where(eq(schema.purchases.outletId, outletId)).orderBy(desc(schema.purchases.purchaseDate), desc(schema.purchases.id)).limit(40);
    body = (
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <PurchaseForm today={businessDate()} suppliers={sup.map((s) => ({ id: s.id, name: s.name }))} ingredients={rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, cost: r.avgCost }))} />
          <div className="card overflow-x-auto">
            <table className="w-full"><thead className="border-b border-[var(--border)]"><tr><th className="th">Date</th><th className="th">Supplier</th><th className="th">Invoice</th><th className="th text-right">Total</th><th className="th text-right">Paid</th></tr></thead>
              <tbody>{purchases.map(({ p, supplier }) => <tr key={p.id} className="border-b border-stone-100 last:border-0"><td className="td">{fmtDate(p.purchaseDate)}</td><td className="td">{supplier ?? "—"}</td><td className="td text-[var(--muted)]">{p.invoiceNo || "—"}</td><td className="td text-right font-medium">{fmt(p.total)}</td><td className="td text-right">{p.paid >= p.total ? <span className="text-emerald-700">Paid</span> : <span className="text-red-600">Due {fmt(p.total - p.paid)}</span>}</td></tr>)}</tbody></table>
            {purchases.length === 0 && <Empty>No purchases recorded yet.</Empty>}
          </div>
        </div>
        <div className="space-y-4"><SupplierForm /><IngredientForm /></div>
      </div>
    );
  } else if (tab === "recipes" && manager) {
    const menu = await db.select({ id: schema.items.id, name: schema.items.name }).from(schema.items).where(eq(schema.items.active, true)).orderBy(asc(schema.items.name));
    const rec = await db.select().from(schema.recipes);
    body = <RecipeEditor items={menu} ingredients={rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, cost: r.avgCost }))} recipes={rec.map((r) => ({ itemId: r.itemId, ingredientId: r.ingredientId, qty: Number(r.qty) }))} />;
  } else if (tab === "log") {
    const mv = await db.select({ m: schema.stockMovements, name: schema.ingredients.name, unit: schema.ingredients.unit }).from(schema.stockMovements)
      .innerJoin(schema.ingredients, eq(schema.ingredients.id, schema.stockMovements.ingredientId))
      .where(and(eq(schema.stockMovements.outletId, outletId), sql`${schema.stockMovements.kind} <> 'sale'`)).orderBy(desc(schema.stockMovements.createdAt)).limit(100);
    body = (
      <div className="card overflow-x-auto"><table className="w-full"><thead className="border-b border-[var(--border)]"><tr><th className="th">When</th><th className="th">Ingredient</th><th className="th">Type</th><th className="th text-right">Qty</th><th className="th">Note</th></tr></thead>
        <tbody>{mv.map(({ m, name, unit }) => <tr key={m.id} className="border-b border-stone-100 last:border-0"><td className="td text-[var(--muted)]">{fmtDateTime(m.createdAt)}</td><td className="td">{name}</td><td className="td capitalize">{m.kind}</td><td className={`td text-right font-medium ${Number(m.qty) < 0 ? "text-red-600" : "text-emerald-700"}`}>{Number(m.qty) > 0 ? "+" : ""}{+Number(m.qty).toFixed(3)} {unit}</td><td className="td text-[var(--muted)]">{m.note}</td></tr>)}</tbody></table>
        {mv.length === 0 && <Empty>No wastage, purchases or adjustments yet.</Empty>}</div>
    );
  } else {
    body = <StockTable rows={rows} canManage={manager} />;
  }

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock is deducted automatically from recipes when a KOT is sent." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Stock value" value={fmt(Math.round(value))} />
        <Stat label="Ingredients tracked" value={String(rows.length)} />
        <Stat label="Low / out of stock" value={String(low.length)} tone={low.length ? "bad" : "good"} />
        <Stat label="Out of stock" value={String(rows.filter((r) => r.qty <= 0).length)} tone={rows.some((r) => r.qty <= 0) ? "bad" : undefined} />
      </div>
      <Tabs base="/inventory" current={tab} tabs={tabs} />
      {body}
    </div>
  );
}
