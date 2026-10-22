// Small in-memory sliding-window limiter for public endpoints. Single-instance; use Redis/edge limits when scaling out.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { buckets.set(key, recent); return false; }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

const DEFAULT_ORIGINS = ["https://www.misalhub.com", "https://misalhub.com"];

/** CORS headers for browser calls from the marketing site (allow-list via PUBLIC_ORIGINS, comma-separated). */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (process.env.PUBLIC_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean)) ?? DEFAULT_ORIGINS;
  const origin = req.headers.get("origin");
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && allowed.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return h;
}
