// Logs in and screenshots key screens. Usage: node scripts/shots.mjs <outDir> [phone] [password] [paths...]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
const phone = process.argv[3] || "9004167448";
const password = process.argv[4] || "Misal@2026";
const paths = process.argv.slice(5).length ? process.argv.slice(5) : ["/dashboard", "/pos", "/orders", "/kds", "/menu", "/delivery"];
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

await page.goto("http://localhost:3000/login");
await page.screenshot({ path: path.join(out, "login.png") });
await page.getByRole("button", { name: "Password" }).click();
await page.fill("#phone", phone);
await page.fill("#secret", password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 });

for (const p of paths) {
  const res = await page.goto("http://localhost:3000" + p, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(500);
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false });
  console.log(p, res?.status());
}
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no browser errors");
await browser.close();
