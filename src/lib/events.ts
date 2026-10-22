// In-process pub/sub used for realtime screens (KDS, order board) over Server-Sent Events.
// A single Node instance is assumed; for multi-instance deployments swap this for Redis pub/sub or Postgres LISTEN/NOTIFY.
export type AppEvent = { type: string; outletId: number; orderId?: number; at: number; data?: unknown };
type Listener = (e: AppEvent) => void;

const g = globalThis as unknown as { __listeners?: Set<Listener> };
const listeners = (g.__listeners ??= new Set<Listener>());

export function publish(e: Omit<AppEvent, "at">) {
  const evt = { ...e, at: Date.now() };
  for (const l of listeners) {
    try { l(evt); } catch { /* a dead stream must not break the publisher */ }
  }
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
