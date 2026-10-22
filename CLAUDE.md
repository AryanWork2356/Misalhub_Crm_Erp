# Misal Hub — handoff for the next Claude

Read this first. It says what the project is, what is already built, how it is built, the owner's rules, and what is still open.
Details of the external accounts are in `docs/SETUP.md`; the run/architecture notes are in `README.md`; env var names are in `.env.example`.

## The business

- **Misal Hub**: Maharashtrian misal pav shop, Shop 2/3, Silver Cassia Apartment, Pleasant Park Road, Mira Road East, Thane 401107. Open **8 AM – 8 PM** daily (IST), running since **2015**.
- Phone **+91 90041 67448** (WhatsApp 919004167448). Founders: **Vinay Jadhav and Sonam Jadhav**. Legal name is probably "AK Misal Hub" (not confirmed, do not put it on the site until the owner gives exact spelling and address).
- The site does two jobs: **sells food online** (home delivery and pickup, online payment only, no cash on delivery) and **sells franchises**.
- Live at **https://www.misalhub.com** (GoDaddy domain, hosted on Vercel). Repo: **https://github.com/AryanWork2356/Misal_Hub_Website-** (repo may stay public).
- The folder `D:\Data\misalhub` is the OLD static site. The real project is **`D:\Data\misalhub-next`** (this repo). Work only here.

## Owner's working rules (follow these)

1. The owner (Aryan) wants things fast, attractive and professional. They sometimes write Hinglish and sometimes English. **Reply in the language their latest message is written in**; do not switch language on your own. Keep replies short and plain.
2. **Commit and push to GitHub after every change**, without being asked. Only this repo. Commit message ends with the Co-Authored-By line the harness gives.
3. **Never put secrets in the repo** (no API keys, tokens, passwords, `.env.local`). The owner once pasted a GitHub token in chat; it should be deleted/revoked on GitHub.
4. **Ask before changing** anything the owner said is better handled on their side (accounts, KYC, legal wording, pricing decisions).
5. Franchise page standing rules: **no emojis, no starting price / fee shown on the page**.
6. Do not promise things to customers or franchisees that the owner has not decided (for example "lifetime" royalty-free).
7. Test before saying "done". Say plainly what failed or was skipped.

## Stack

- **Next.js 16.4 (App Router, Turbopack, `cacheComponents` on)**, React 19, TypeScript, GSAP + Lenis for effects. Read `AGENTS.md`: this Next version differs from older ones; check `node_modules/next/dist/docs/` before using unfamiliar APIs.
  - With cacheComponents: no `new Date()` / random during prerender in client components (use effects or `connection()`); route handlers that read live data call `connection()`.
- Backend is **Google Sheet + Google Apps Script** (`apps-script/Code.gs`, deployed as a Web app). Orders, franchise applications, shop status, menu stock, accounts/offers live in the Sheet. Emails go out through the script.
- **Razorpay** for payments (checkout + signature verify + webhook as safety net). **Google Maps Platform** (Geocoding, Routes, Places New) for delivery distance, address search and real Google reviews. **Google sign-in** + email login for customer accounts (HMAC-signed session cookie, `SESSION_SECRET`).
- Tests: `npm test` (vitest, pricing/hours/signatures), `npm run build`, `npm run test:integration` (real server vs stand-ins for Razorpay and Google). Browser tests were done with puppeteer-core driving Edge (headless) against `next start -p 3100`.

## How the code is organised

- `src/app/**/page.tsx` pages: `/` home, `/menu` (menu + cart + checkout), `/about`, `/franchise`, `/bulk-orders`, `/offer`, `/my-orders`, `/credits`, and legal pages (`privacy-policy`, `terms`, `refund-policy`, `delivery-policy`). `src/app/api/**` holds the route handlers (auth, bulk, checkout create/verify, delivery quote, franchise, orders, promo, razorpay webhook, status, track).
- `src/data/menu.ts` — menu, prices, Jain prices, config. `src/data/reviews.ts` — fallback sample reviews. `src/data/legal.ts` — policy text.
- `src/lib/pricing.ts` — **single source for prices, delivery rules and opening hours**; the server re-prices every cart, the browser only previews. Never trust a price from the browser.
- `src/lib/server/*` — server-only code: `sheet.ts` (Apps Script calls), `razorpay.ts`, `session.ts`, `guard.ts` (rate limits), `status.ts` (owner's pause switch and out-of-stock list), `geo.ts`, `reviews.ts`, `login.ts`, `orderView.ts`, `env.ts`.
- `src/lib/seo.ts` — page metadata helper, JSON-LD, and all FAQ text (`FAQ`, `FRANCHISE_FAQ`).
- `src/components/` — `PageShell`, `Topbar`, `Navbar`, `Footer`, `FloatButtons` (WhatsApp widget), `MenuApp` (menu, cart, checkout), `OrderTracker`, `MyOrders`, `ApplyForm`, `BulkForm`, `FaqSection`, etc.

### CSS (important gotcha)

The CSS is **legacy CSS auto-scoped per page**. Do not edit `src/styles/*.css` by hand.
Edit `legacy/premium.css` (shared premium styles, also used by all pages), `legacy/franchise.css`, `legacy/order.css`, etc., then run:

```
node scripts/scope-css.mjs
```

That regenerates `src/styles/<page>.css`, scoped under `.pg-home`, `.pg-menu`, `.pg-about`, `.pg-franchise`, and renames keyframes. Every page is wrapped in `<PageShell page="home|menu|about|franchise">`. Add `?nofx` to a URL to switch animations off for screenshots. Brand colours: dark brown background, orange (`#FF8A1F`) accents, Playfair Display headings, Poppins body.

## What is already built and working

**Ordering**
- Menu with regular/Jain prices, cart, checkout, delivery or pickup, Razorpay payment, order saved to the Sheet, emails to shop and customer.
- Delivery fee by road distance from the shop pin: **₹50 up to 1 km, ₹80 up to 5 km, no delivery beyond 5 km**. Open hours 8–8 IST are enforced on the server too.
- Owner switches (Sheet "Settings" tab): pause delivery, pause pickup, with a message. Menu tab: mark a dish **out of stock** with a note; server refuses it (409), cart blocks checkout.
- Accounts: Google sign-in (profile picture) and email login; **My Orders** in the profile menu; live multi-order tracker with ETA per order; finished orders stay visible for 10 minutes; cancelled orders show correctly.
- Offer system: QR + creative `/offer` page, **MISAL10** = 10% off first order, one use per phone number.
- Bulk / party orders form. Real Google reviews via Places API (falls back to sample reviews until the key works).
- Security basics: HMAC session cookie, rate limits, server-side re-pricing, Razorpay signature checks.

**Site and SEO**
- Brown/orange theme, hero video on home, real shop photo, favicon and app icons, OG share image (`public/images/og-share.jpg`), sitemap/robots, JSON-LD, FAQ sections, breadcrumb schema. SEO notes are in `docs/SEO.md`.
- Phone-menu bug (header backdrop-filter trapping the menu), WhatsApp widget covering the page, default Next favicon, contact-us scroll bug: all fixed.

**Franchise page (`/franchise`, rebuilt last)**
- Hero with shop photo and a "0% monthly royalty, first 10 partners" seal; orange royalty band; 6 "what you get" cards; 5 steps; 5 standards; FAQ (6 items); dark apply form (`ApplyForm`, posts to `/api/franchise` → Sheet + email). CSS classes are `fr2-*` at the end of `legacy/premium.css`.
- Business decisions reflected on the page: no monthly royalty for the first 10 partners (without promising lifetime); **exclusive Misal Masala** supplied only by Misal Hub; outside board/banner; counters, tables and chairs sourced by Misal Hub at supplier rates; billing software and Excel/sales sheets; Misal Hub delivery riders are mandatory, Zomato/Swiggy onboarding help; franchisee suggests the location and Misal Hub gives final approval; only Misal Hub boards, packaging and menu, no competing brands in the shop; hygiene, FSSAI and quality first; **3 missed online deliveries → online orders paused for that outlet**.
- Exit terms, penalties and deposit belong in the **franchise agreement, not on the page**. Fee idea given to the owner (their decision): founding fee ₹3.5–5 lakh, plus refundable deposit ₹50k–1 lakh, plus a separate setup package. The owner thought ₹2 lakh too low.

## How to run and ship

```
cd D:\Data\misalhub-next
npm install
npm run dev                       # http://localhost:3000
npm run build && npx next start -p 3100
npx tsc --noEmit
```

- A build takes about 3–4 minutes on the owner's PC. Do not start a second `next build` while one runs ("Another next build process is already running"); stop stray node processes and delete `.next/lock` if needed.
- `next build` currently compiles and generates all pages, then prints a **SecurityFatalError** advisory saying Next 16.4.0 has a known vulnerability, and exits with code 1. If Vercel deploys fail with this, upgrading Next is the fix; confirm with the owner first.
- Push to `main` on GitHub; Vercel deploys automatically.
- Windows shell: heredocs with quotes get mangled. Prefer writing a file and running it. Use the Edge executable at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` for puppeteer-core.
- Test lessons: use separate servers for rate-limit tests; freeze the clock when testing open/closed hours; the shared WhatsApp widget contains emojis, so an "emoji check" on a whole page always trips on it.

## Environment variables (names only; values live in Vercel, never in the repo)

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACE_ID`, `SHOP_LATLNG`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET`, and test-only flags `ORDERS_IGNORE_HOURS`, `ORDERS_TEST_MODE`, `ORDERS_DELIVERY_PAUSED`, `ORDERS_PICKUP_PAUSED`. Production must leave the test flags empty.

## Still open (waiting on the owner, not on code)

1. **Redeploy the Apps Script** (`apps-script/Code.gs`) after every change to it; the new web-app version must be deployed or the site keeps using the old one.
2. **Razorpay**: test keys, one test payment, webhook, then KYC. KYC address proof is a problem because the shop is rented.
3. **Google Cloud**: add a billing card, enable Maps/Places/OAuth. After that, disable the sample reviews.
4. Transfer **Google Business Profile** ownership. The phone number Google shows (086918 96366) differs from the site's +91 90041 67448; make them consistent.
5. Give the **exact legal name and address** for footer and policies; review the policy pages (privacy, terms, refund, delivery).
6. **Vercel Pro** is needed for commercial use. Delete the pasted GitHub token.
7. Decide the franchise fee, deposit and agreement terms (royalty after the first 10 partners, exit, penalties).

## Ideas offered but not built

- ₹200 service-recovery credit for a bad delivery.
- One-offer-per-address check (MISAL10 is currently one per phone number).
- Real dish photos in `public/images/menu/<dish-id>.jpg` (missing files are skipped).
- Legal name "AK Misal Hub (proprietor Vinay Jadhav)" in footer and policies once confirmed.
