// Public order -> staff accept -> kitchen -> payment, plus security probes. Usage: node scripts/e2e-online.mjs <outDir>
import { chromium, request } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log(c ? "ok  -" : "FAIL-", m); if (!c) failed++; };

const api = await request.newContext({ baseURL: BASE });
const menu = await (await api.get("/api/public/menu/MRD")).json();
const all = menu.categories.flatMap((c) => c.items);
const chaas = all.find((i) => i.name === "Chaas");
const thali = all.find((i) => i.name === "Misal Thali");
ok(!!chaas && chaas.price === 30, "public menu endpoint returns Chaas at ₹30");

// ---- security / validation probes ----
let n = 10;
const post = (body, ip) => api.post("/api/public/order", { data: body, headers: { "x-forwarded-for": ip ?? `10.0.0.${n++}` } });
const base = { outlet: "MRD", type: "takeaway", name: "Probe", phone: "9222222222", items: [{ itemId: chaas.id, qty: 1 }] };
ok((await post({ ...base, items: [{ itemId: chaas.id, qty: 1, modifierIds: [1] }] })).status() === 400, "modifier not belonging to the item is rejected");
ok((await post({ ...base, phone: "123" })).status() === 400, "bad phone rejected");
ok((await post({ ...base, website: "http://spam" })).status() === 400, "honeypot field rejects bots");
ok((await post({ ...base, outlet: "NOPE" })).status() === 404, "unknown outlet -> 404");
ok((await post({ ...base, type: "delivery" })).status() === 400, "delivery without address rejected");
ok((await post({ ...base, type: "dine_in", table: "ZZ" })).status() === 400, "unknown table rejected");
ok((await post({ ...base, items: [{ itemId: chaas.id, qty: -5 }] })).status() === 400, "negative quantity rejected");
ok((await api.get("/api/export?type=orders&from=2026-10-01&to=2026-10-23")).status() === 403, "export without login -> 403");
ok((await api.get("/api/events")).status() === 401, "event stream without login -> 401");

// ---- a real guest order (delivery) ----
const res = await post({ outlet: "MRD", type: "delivery", name: "Online Guest", phone: "9333333333", address: "Flat 5, Beverly Park, Mira Road East", distance: "far", notes: "ring the bell",
  items: [{ itemId: thali.id, qty: 2 }, { itemId: chaas.id, qty: 1 }] });
const placed = await res.json();
ok(res.status() === 200 && placed.ok, `guest order accepted (#${placed.orderNo}, total ₹${placed.total / 100})`);
// 2 x 170 + 30 = 370 + far delivery 80 = 450
ok(placed.total === 45000, "server priced it itself: ₹450 incl. ₹80 delivery");

// ---- staff side ----
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(BASE + "/login");
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Password" }).click();
await page.fill("#phone", "9000000002"); // manager
await page.fill("#secret", "Misal@2026");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard", { timeout: 120000 });

await page.goto(BASE + "/orders");
const card = page.locator("div", { hasText: `#${placed.orderNo} · Website` }).filter({ has: page.getByRole("button", { name: "Accept" }) }).last();
await card.getByRole("button", { name: "Accept" }).click();
await page.getByText("Accepted — sent to kitchen").waitFor({ timeout: 30000 });
ok(true, "manager accepted the online order");

await page.goto(BASE + "/kds");
const ticket = page.locator("div.rounded-xl", { hasText: `#${placed.orderNo}` }).first();
await ticket.getByRole("button", { name: "Start cooking" }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(out, "kds_cooking.png") });
await page.getByRole("button", { name: /All ready/ }).first().click();
await page.waitForTimeout(800);
ok(true, "kitchen started and marked ready");

await page.goto(BASE + "/delivery");
await page.waitForLoadState("networkidle");
const dcard = page.locator("div.card", { hasText: `#${placed.orderNo} ·` }).first();
await dcard.locator("select").selectOption({ index: 1 });
await page.getByText("Rider assigned").waitFor({ timeout: 30000 });
ok(true, "rider assigned on the delivery board");
await page.screenshot({ path: path.join(out, "delivery.png") });
await page.locator("div.card", { hasText: `#${placed.orderNo} ·` }).first().getByRole("button", { name: "Cash collected" }).click();
await page.getByText(/Delivered/).first().waitFor({ timeout: 30000 });
ok(true, "delivery completed with cash collected");

await page.goto(BASE + `/orders`);
await page.waitForLoadState("networkidle");
const row = await page.locator("tr", { hasText: `#${placed.orderNo}` }).first().innerText();
ok(/completed/i.test(row) && /paid/i.test(row), "order shows completed + paid in the orders list");

// feedback page works for completed order
const fb = await api.post("/api/public/feedback", { data: { orderId: placed.orderId, rating: 5, comment: "Great!" } });
ok(fb.status() === 200, "customer feedback accepted for the completed order");
ok((await api.post("/api/public/feedback", { data: { orderId: placed.orderId, rating: 1 } })).status() === 409, "second review for same order rejected");

// rate limit (6 per 10 min per IP — we already used several above)
let limited = false;
for (let i = 0; i < 8 && !limited; i++) limited = (await post(base, "10.9.9.9")).status() === 429;
ok(limited, "order endpoint rate-limits a single client");

console.log(errors.length ? "PAGE ERRORS: " + errors.join("; ") : "no page errors");
await browser.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("\nAll online-order checks passed.");
