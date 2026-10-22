// Customer segmentation. Pure functions — safe to use from server or client code.

export type Segment = "vip" | "regular" | "new" | "at_risk" | "lost" | "none";

export const SEGMENT_LABEL: Record<Segment, string> = { vip: "VIP", regular: "Regular", new: "New", at_risk: "At risk", lost: "Lost", none: "Prospect" };
export const SEGMENT_STYLE: Record<Segment, string> = {
  vip: "bg-violet-100 text-violet-800", regular: "bg-emerald-100 text-emerald-800", new: "bg-sky-100 text-sky-800",
  at_risk: "bg-amber-100 text-amber-800", lost: "bg-red-100 text-red-700", none: "bg-stone-100 text-stone-600",
};

const DAY = 86400000;

export function segmentOf(c: { visits: number; totalSpent: number; lastVisitAt: Date | string | null }, now = Date.now()): Segment {
  if (!c.lastVisitAt || c.visits === 0) return "none";
  const since = (now - new Date(c.lastVisitAt).getTime()) / DAY;
  if (since > 60) return "lost";
  if (since > 30 && c.visits >= 3) return "at_risk";
  if (c.visits >= 8 || c.totalSpent >= 300000) return since <= 30 ? "vip" : "at_risk";
  if (c.visits <= 2) return "new";
  return "regular";
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(text)}`;
}

export function fillTemplate(t: string, c: { name: string }): string {
  const first = (c.name || "").trim().split(/\s+/)[0] || "there";
  return t.replaceAll("{name}", first);
}

export const CAMPAIGN_TEMPLATES: { id: string; label: string; segment: Segment | "birthday" | "all"; text: string }[] = [
  { id: "winback", label: "Win-back (at risk)", segment: "at_risk", text: "Hi {name}! 🍲 We miss you at Misal Hub. Come back this week and enjoy 10% off with code WELCOME10. Fresh misal is waiting for you!" },
  { id: "lost", label: "We miss you (lost)", segment: "lost", text: "Hi {name}, it's been a while! Your favourite Misal Pav is calling. Show this message at Misal Hub for a free Kulhad Tea with any order. ☕" },
  { id: "vip", label: "VIP thank-you", segment: "vip", text: "Hi {name}! Thank you for being one of our most loyal guests at Misal Hub ❤️ Enjoy a complimentary Kokam Sarbat on your next visit." },
  { id: "new", label: "Welcome new customers", segment: "new", text: "Hi {name}, thanks for trying Misal Hub! 🙏 Tell us how it was — and use WELCOME10 for 10% off your next order." },
  { id: "birthday", label: "Birthday wish", segment: "birthday", text: "Happy Birthday {name}! 🎂 Celebrate with us — a free Gulab Jamun with any order today at Misal Hub." },
  { id: "all", label: "New menu / announcement", segment: "all", text: "Hi {name}! New at Misal Hub: try our Loaded Cheese Grill Vada Pav! Order on WhatsApp: 90041 67448 🍲" },
];
