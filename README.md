# Misal Hub OS

Restaurant management system for Misal Hub (Mira Road East) and its franchise outlets — billing/POS, kitchen display, online & QR ordering, inventory with recipe costing, CRM & WhatsApp campaigns, reports with GST, cash register, staff & payroll, franchise royalties, and an AI "ask your business" assistant.

Built with Next.js 16 (App Router) · TypeScript · PostgreSQL (Drizzle ORM) · Tailwind 4. Installable as a PWA on tablets and phones.

---

## Quick start (development)

```bash
npm install
cp .env.example .env.local        # SESSION_SECRET already set for dev in the repo's .env.local
npm run db:fresh                  # creates the embedded dev database + menu + ~6 weeks of demo data (~2.5 min)
npm run dev                       # http://localhost:3000
```

`npm run db:fresh` = reset → migrate → seed (real Misal Hub menu, 70 items) → demo activity. For just the menu with no demo orders: `npm run db:reset && npm run db:migrate && npm run db:seed`.

In development no Postgres install is needed: an embedded Postgres (PGlite) stores data in `.data/pgdata`. Stop the dev server before running any `db:*` command (the embedded database is single-process).

### Demo logins (development only)

| Role | Mobile | Sign in with |
|---|---|---|
| Owner | 9004167448 | password `Misal@2026` |
| Head-office admin | 9000000001 | password `Misal@2026` |
| Manager | 9000000002 | password `Misal@2026` |
| Cashier | 9000000003 | PIN `4444` |
| Waiter | 9000000004 | PIN `5555` |
| Kitchen | 9000000005 | PIN `6666` |
| Delivery rider | 9000000006 | PIN `7777` |
| Franchisee (sample outlet) | 9000000007 | password `Misal@2026` |

These exist only in the dev seed. **Never use them in production** (see below).

---

## What's inside

| Module | What it does |
|---|---|
| **POS** | Dine-in / takeaway / delivery / bulk. Table map with live occupancy, modifiers (spice level, Jain, add-ons), per-line notes, hold, KOT, discounts (manual / coupon / loyalty points), split payments (cash/UPI/card), UPI QR, change calculation, 80 mm GST bill and KOT print. Cashier discount limit 10 % / ₹50, manager override. |
| **Kitchen display** | Live tickets (server-sent events), per-station filter (kitchen / beverages), per-item and whole-ticket status, late-order colouring, new-order beep. |
| **Online ordering** | Public page `/order/<OUTLET_CODE>` (pickup + delivery) and per-table QR `/order/<CODE>?table=T1`. Orders land in an *Incoming* queue with Accept/Reject. Prices are always computed server-side. |
| **Delivery** | Assign riders, rider-only view, collect cash/UPI at the door, WhatsApp the customer, map link. |
| **Menu** | Master menu (head office) with per-outlet price override and sold-out toggle, GST rate per item, modifier groups, food-cost % per item. |
| **Inventory** | Recipe-based automatic stock deduction on KOT, purchases with weighted-average cost, wastage, daily production batches (e.g. fresh masala), stock counts, low-stock alerts, movement log. |
| **Customers / CRM** | Auto-created from billing phone numbers, segments (VIP / Regular / New / At-risk / Lost), order history, favourites, loyalty ledger. |
| **Marketing** | One-click WhatsApp campaigns by segment (win-back, VIP thank-you, birthdays), coupons, feedback dashboard. |
| **Reports** | Sales, hourly & weekday heat-map, item-wise margin, GST summary, payment modes, profit & loss, CSV export, day-end Z report. |
| **Cash register** | Open/close shift with float, expected vs counted cash, over/short tracking. |
| **Expenses, Staff** | Expense ledger, attendance (self clock-in/out), payroll, role-restricted user management. |
| **Franchise** | Outlet league table, royalty statements, franchise-lead pipeline fed by your website form. |
| **Insights** | Auto-alerts, *morning prep planner* (tomorrow's forecast → ingredient quantities), stock run-out forecast, "bought together" pairs, menu engineering, and an AI assistant. |
| **Audit log** | Cancellations, refunds, price changes, point adjustments, user changes. |

### Roles

`owner` and `admin` see everything and all outlets · `franchisee` and `manager` run one outlet · `cashier` bills · `waiter` takes orders · `kitchen` uses the kitchen display and logs wastage · `delivery` sees only their own deliveries. Permissions are enforced on the server in every action, not just hidden in the menu.

---

## Configuration

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. **Empty in dev** → embedded database. Required in production. |
| `SESSION_SECRET` | 32+ random characters used to sign login sessions. **Required in production** (the app refuses to start sessions without it). Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_OWNER_PHONE` | Optional, seed only: mobile number for the owner login (default 9004167448). |
| `ANTHROPIC_API_KEY` | Optional. Enables the *Ask your business* assistant in Insights. Without it everything else works. |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `NEXT_PUBLIC_APP_URL` | Your public URL, shown in Settings → Online ordering. |
| `PUBLIC_ORIGINS` | Comma-separated websites allowed to call the public API from a browser (default `https://www.misalhub.com,https://misalhub.com`). |

---

## Deploying to production

1. **Database** — create a PostgreSQL database (managed Postgres on Railway/Neon/Supabase/RDS, or your own server). Set `DATABASE_URL`.
2. **Schema** — `npm run db:migrate`
3. **First data** — `SEED_OWNER_PASSWORD='a-long-unique-password' npx tsx src/db/seed.ts --i-understand-this-wipes-the-database` on an **empty** database. In production this creates the outlet, the menu, ingredients/recipes and **only the owner**; add staff from *Staff → Add staff*. (The seed wipes tables, which is why it refuses to run otherwise.)
4. **Run** — `npm run build && npm start` behind HTTPS (Caddy / nginx / your host's TLS). The session cookie is `Secure` in production.
5. **Reverse proxy** — pass the real client IP in `X-Forwarded-For` (used by public-endpoint rate limits) and make sure clients can't set it themselves.
6. **Backups** — enable daily automated backups of the Postgres database. All business data lives there.
7. Fill in **Settings → Outlet & billing**: GSTIN, FSSAI, UPI ID, bill footer, tax mode.

Run a **single app instance** for now: the live kitchen updates use in-process events and login attempt limits are in memory. To scale horizontally, swap `src/lib/events.ts` for Redis pub/sub (or Postgres `LISTEN/NOTIFY`) and move the rate limiters to Redis.

### Connecting your existing website (misalhub.com)

* **Franchise form** → `POST https://<your-app>/api/public/franchise-lead` with JSON `{ name, phone, city, budget, message }`. Leads appear in *Franchise → Franchise leads*.
* **Menu** → `GET https://<your-app>/api/public/menu/MRD` returns the live menu with current prices and availability.
* **Order button** → link to `https://<your-app>/order/MRD`.

---

## Development

```bash
npm run typecheck      # TypeScript
npm test               # unit tests: pricing/GST, coupons, segments, permissions
npm run test:engine    # order-engine integration test (needs a seeded dev DB, server stopped)
npm run db:generate    # after editing src/db/schema.ts, generate a migration
```

Browser end-to-end scripts (Playwright; start `npm run dev` or `npm start` first):

```bash
node scripts/e2e-pos.mjs <outDir>       # cashier PIN login → table → KOT → payment → bill
node scripts/e2e-online.mjs <outDir>    # guest order → accept → kitchen → rider → paid, plus security probes
node scripts/shots.mjs <outDir> <phone> <password> /dashboard /reports ...
```

Where things live: `src/lib/orders.ts` (order engine), `src/lib/pricing.ts` (GST & discount maths, shared by server and POS screen), `src/lib/reports.ts` and `src/lib/insights.ts` (analytics), `src/app/actions/*` (server actions — every one re-checks role and outlet), `src/app/api/public/*` (guest-facing endpoints).

---

## Things to know before relying on it

* **GST.** Menu GST rates default to 5 % (restaurant services) and 18 % for packaged water / cold drinks, with prices treated as GST-inclusive. These are configurable per item and per outlet, but **have your CA confirm the rates and the invoice format** before issuing bills. Delivery charges are currently not taxed.
* **Payments** are recorded by staff; there is no payment-gateway integration. The UPI QR is a standard `upi://pay` link — confirm receipt in your UPI app before completing payment.
* **Printing** uses the browser's print dialog formatted for 80 mm thermal paper. Direct ESC/POS printing and cash-drawer kick are not included.
* **No offline mode yet.** Billing needs the server to be reachable. The app is installable as a PWA, but an internet outage will stop billing.
* **Aggregators** (Swiggy/Zomato) are not integrated; the `swiggy`/`zomato` channels exist so you can key such orders in manually.
* **WhatsApp** campaigns open pre-filled WhatsApp chats for each customer (you press send). Automated bulk sending requires the WhatsApp Business API and approved templates.
* Customers with a phone number are stored in the CRM; make sure your privacy policy covers this. Marketing messages go only to customers whose `marketing opt-in` is on.
