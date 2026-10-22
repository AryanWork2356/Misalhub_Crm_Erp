"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Subscribes to the outlet's live order stream and refreshes server data (debounced). Falls back to polling if SSE drops. */
export function LiveRefresh({ pollMs = 30000 }: { pollMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const es = new EventSource("/api/events");
    es.onmessage = refresh;
    const poll = setInterval(refresh, pollMs);
    return () => { es.close(); clearInterval(poll); if (timer.current) clearTimeout(timer.current); };
  }, [router, pollMs]);
  return null;
}
