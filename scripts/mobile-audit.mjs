// Phone-size audit of every screen. Usage: node scripts/mobile-audit.mjs <outDir> [baseUrl] [phone] [password]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2];
const BASE = process.argv[3] || "http://localhost:4310";
const phone = process.argv[4] || "9004167448";
const password = process.argv[5] || "Misal@2026";
fs.mkdirSync(out, { recursive: true });

const PAGES = ["/dashboard", "/pos", "/orders", "/kds", "/delivery", "/menu", "/menu?tab=modifiers", "/inventory", "/inventory?tab=purchases", "/inventory?tab=recipes",
  "/customers", "/marketing", "/marketing?tab=coupons", "/marketing?tab=feedback", "/reports", "/reports?tab=items", "/reports?tab=pnl", "/insights", "/register",
  "/expenses", "/staff", "/staff?tab=attendance", "/franchise", "/franchise?tab=leads", "/settings", "/settings?tab=tables", "/order/MRD"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Password" }).click();
await page.fill("#phone", phone);
await page.fill("#secret", password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 });

let bad = 0;
for (const p of PAGES) {
  await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(350);
  const res = await page.evaluate(() => {
    const vw = 390; // true phone width (the emulated viewport stretches when a page is too wide)
    const doc = document.documentElement.scrollWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      // ignore anything inside a horizontally scrollable container (tables, chip rows)
      let anc = el.parentElement, scrollable = false;
      while (anc && anc !== document.body) { const o = getComputedStyle(anc).overflowX; if (o === "auto" || o === "scroll") { scrollable = true; break; } anc = anc.parentElement; }
      if (!scrollable) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
    }
    const small = [...document.querySelectorAll("button, a, input, select")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 30) && getComputedStyle(e).visibility !== "hidden" && e.type !== "hidden" && e.type !== "checkbox"; }).length;
    return { vw, doc, offenders: offenders.slice(0, 3), small };
  });
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  const flag = res.doc > res.vw + 1 || res.offenders.length;
  if (flag) bad++;
  console.log(`${flag ? "FIX " : "ok  "} ${p.padEnd(28)} width=${res.doc}/${res.vw} small-targets=${res.small}${res.offenders.length ? "  " + res.offenders.join(" | ") : ""}`);
}
console.log(bad ? `\n${bad} page(s) overflow the phone screen` : "\nNo page overflows the phone screen");
await browser.close();
