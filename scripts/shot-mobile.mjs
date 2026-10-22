// Mobile/tablet screenshots. Usage: node scripts/shot-mobile.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

// 1. Guest ordering on a phone
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await phone.goto("http://localhost:3000/order/MRD", { waitUntil: "networkidle" });
await phone.screenshot({ path: path.join(out, "m_order_menu.png") });
await phone.getByRole("button", { name: "Add Only Misal" }).first().click();
await phone.getByRole("button", { name: /^Add · / }).click();
await phone.screenshot({ path: path.join(out, "m_order_added.png") });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log("order page horizontal overflow on phone:", overflow);

// 2. Staff POS on a tablet (portrait) and phone
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 } });
const tab = await ctx.newPage();
await tab.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
await tab.fill("#phone", "9000000003");
for (const d of "4444") await tab.getByRole("button", { name: d, exact: true }).click();
await tab.getByRole("button", { name: "Sign in" }).click();
await tab.waitForURL("**/pos", { timeout: 60000 });
await tab.waitForLoadState("networkidle");
await tab.screenshot({ path: path.join(out, "t_pos.png") });
console.log("tablet POS overflow:", await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await tab.setViewportSize({ width: 390, height: 844 });
await tab.waitForTimeout(400);
await tab.getByRole("button", { name: /^Misal Pav ₹90/ }).first().click();
await tab.getByRole("button", { name: /^Add · / }).click();
await tab.screenshot({ path: path.join(out, "m_pos.png") });
console.log("phone POS overflow:", await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
await browser.close();
