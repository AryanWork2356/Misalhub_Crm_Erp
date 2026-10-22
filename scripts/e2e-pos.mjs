// End-to-end POS flow as the cashier (PIN login). Usage: node scripts/e2e-pos.mjs <outDir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const step = (m) => console.log("•", m);
const fail = (m) => { console.error("FAIL:", m); process.exitCode = 1; };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// PIN login via on-screen keypad
await page.goto("http://localhost:3000/login");
await page.waitForLoadState("networkidle");
await page.fill("#phone", "9000000003");
for (const d of "4444") await page.getByRole("button", { name: d, exact: true }).click();
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/pos", { timeout: 120000 });
step("cashier PIN login lands on /pos");

// cashier must not reach manager pages
await page.goto("http://localhost:3000/menu");
await page.waitForURL("**/pos", { timeout: 30000 });
step("cashier redirected away from /menu");

await page.getByRole("button", { name: "Select table" }).click();
await page.getByRole("button", { name: /^T1\b/ }).click();
step("table T1 selected");

await page.getByRole("button", { name: /^Misal Pav ₹90/ }).first().click();
await page.getByRole("button", { name: "Spicy", exact: true }).click();
await page.getByRole("button", { name: "Jain (no onion/garlic)" }).click();
await page.getByRole("button", { name: /^Add · ₹90/ }).click();
await page.getByRole("button", { name: /^Kulhad Tea/ }).first().click();
step("added Misal Pav (Spicy, Jain) + Kulhad Tea");
await page.getByRole("button", { name: "Customer" }).click();
await page.getByPlaceholder("Name", { exact: true }).fill("E2E Tester");
await page.getByPlaceholder("Phone", { exact: true }).fill("9111111111");
await page.getByRole("button", { name: "Use these details" }).click();

const cart = page.locator("aside");
if (!(await cart.getByText("Total").first().isVisible())) fail("cart total missing");
await page.screenshot({ path: path.join(out, "pos_cart.png") });

await page.getByRole("button", { name: "KOT" }).first().click();
await page.getByText(/KOT #\d+ sent to kitchen/).waitFor({ timeout: 30000 });
step("KOT sent");
await page.screenshot({ path: path.join(out, "pos_after_kot.png") });

await page.getByRole("button", { name: "Pay" }).click();
await page.getByText(/Collect payment/).waitFor();
await page.screenshot({ path: path.join(out, "pos_pay.png") });
await page.getByRole("button", { name: "Complete payment" }).click();
await page.locator("#print-area").waitFor({ timeout: 30000 });
step("payment complete, bill shown");
await page.screenshot({ path: path.join(out, "pos_receipt.png") });
const bill = await page.locator("#print-area").innerText();
console.log(bill.split("\n").slice(0, 30).join(" | "));
if (!/Misal Pav/.test(bill) || !/CGST/.test(bill) || !/TOTAL/.test(bill)) fail("bill missing expected content");
await page.getByRole("button", { name: "Done" }).click();

// table T1 should be free again
await page.getByRole("button", { name: "Select table" }).click();
const t1 = await page.getByRole("button", { name: /^T1\b/ }).innerText();
if (!/Free/.test(t1)) fail("T1 not freed after payment: " + t1); else step("T1 free again");

console.log(errors.length ? "PAGE ERRORS: " + errors.join("; ") : "no page errors");
await browser.close();
