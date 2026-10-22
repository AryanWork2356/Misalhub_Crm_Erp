import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, couponAmount, manualDiscount } from "../src/lib/pricing";
import { segmentOf, fillTemplate } from "../src/lib/crm";
import { can, isManagerUp } from "../src/lib/permissions";
import { fmt } from "../src/lib/money";

const line = (lineTotal: number, taxPct = 5) => ({ lineTotal, taxPct });

test("GST-inclusive: tax is carved out of the price, total unchanged", () => {
  const t = computeTotals({ lines: [line(9000)], discount: 0, taxInclusive: true, gstOn: true });
  assert.equal(t.total, 9000);
  assert.equal(t.tax, 429); // 90 * 5/105 = 4.2857 -> 429 paise
});

test("GST-exclusive: tax is added on top and total rounds to the rupee", () => {
  const t = computeTotals({ lines: [line(9000)], discount: 0, taxInclusive: false, gstOn: true });
  assert.equal(t.tax, 450);
  assert.equal(t.total, 9500); // 94.50 rounds to 95 -> roundOff +50
  assert.equal(t.roundOff, 50);
});

test("discount reduces taxable value proportionally across mixed rates", () => {
  const t = computeTotals({ lines: [line(10000, 5), line(10000, 18)], discount: 4000, taxInclusive: true, gstOn: true });
  assert.equal(t.total, 16000);
  const b5 = t.taxBreakup.find((b) => b.rate === 5)!;
  const b18 = t.taxBreakup.find((b) => b.rate === 18)!;
  assert.equal(b5.taxable + b5.tax, 8000); // half of the 40 discount lands on each line
  assert.equal(b18.taxable + b18.tax, 8000);
});

test("discount can never exceed the subtotal", () => {
  const t = computeTotals({ lines: [line(5000)], discount: 999999, taxInclusive: true, gstOn: true });
  assert.equal(t.total, 0);
});

test("delivery fee and tip are not taxed", () => {
  const t = computeTotals({ lines: [line(10500)], discount: 0, deliveryFee: 5000, tip: 1000, taxInclusive: true, gstOn: true });
  assert.equal(t.total, 16500);
  assert.equal(t.tax, 500);
});

test("GST switched off yields zero tax", () => {
  const t = computeTotals({ lines: [line(10000, 18)], discount: 0, taxInclusive: true, gstOn: false });
  assert.equal(t.tax, 0);
  assert.equal(t.taxBreakup.length, 0);
});

test("coupons respect minimum order and cap", () => {
  const c = { kind: "percent" as const, value: 10, minOrder: 15000, maxDiscount: 5000 };
  assert.equal(couponAmount(c, 10000), 0);
  assert.equal(couponAmount(c, 20000), 2000);
  assert.equal(couponAmount(c, 100000), 5000);
  assert.equal(couponAmount({ kind: "flat", value: 2000, minOrder: 0, maxDiscount: null }, 1500), 1500);
});

test("manual discount math", () => {
  assert.equal(manualDiscount("percent", 10, 25050), 2505);
  assert.equal(manualDiscount("percent", 150, 10000), 10000);
  assert.equal(manualDiscount("flat", 3000, 2000), 2000);
  assert.equal(manualDiscount("none", 99, 5000), 0);
});

test("customer segments", () => {
  const now = new Date("2026-10-23T00:00:00Z").getTime();
  const d = (days: number) => new Date(now - days * 86400000);
  assert.equal(segmentOf({ visits: 0, totalSpent: 0, lastVisitAt: null }, now), "none");
  assert.equal(segmentOf({ visits: 1, totalSpent: 9000, lastVisitAt: d(3) }, now), "new");
  assert.equal(segmentOf({ visits: 5, totalSpent: 60000, lastVisitAt: d(10) }, now), "regular");
  assert.equal(segmentOf({ visits: 12, totalSpent: 150000, lastVisitAt: d(5) }, now), "vip");
  assert.equal(segmentOf({ visits: 6, totalSpent: 60000, lastVisitAt: d(40) }, now), "at_risk");
  assert.equal(segmentOf({ visits: 6, totalSpent: 60000, lastVisitAt: d(90) }, now), "lost");
  assert.equal(fillTemplate("Hi {name}!", { name: "Priya Shah" }), "Hi Priya!");
  assert.equal(fillTemplate("Hi {name}!", { name: "" }), "Hi there!");
});

test("role permissions: cashiers can bill but not see reports or edit staff", () => {
  assert.ok(can("cashier", "pos"));
  assert.ok(!can("cashier", "reports"));
  assert.ok(!can("waiter", "register"));
  assert.ok(can("kitchen", "kds") && !can("kitchen", "pos"));
  assert.ok(!can("manager", "franchise") && can("owner", "franchise"));
  assert.ok(isManagerUp("manager") && !isManagerUp("cashier"));
});

test("money formatting uses Indian grouping", () => {
  assert.equal(fmt(12345600), "₹1,23,456");
  assert.equal(fmt(9050), "₹90.50");
});
