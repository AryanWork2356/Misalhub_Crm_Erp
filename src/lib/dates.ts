const TZ = "Asia/Kolkata";

/** YYYY-MM-DD in IST — the "business date" used for day-end reports. */
export function businessDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStart(dateStr: string): string {
  return dateStr.slice(0, 8) + "01";
}

export function istHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(d));
}

export function fmtDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateStr + "T00:00:00Z"));
}

export function minutesAgo(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 60000);
}
