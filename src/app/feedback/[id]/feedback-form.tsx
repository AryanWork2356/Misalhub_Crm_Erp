"use client";

import { useState } from "react";
import { Star } from "lucide-react";

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="p-1">
          <Star size={34} className={n <= value ? "fill-amber-400 text-amber-400" : "text-stone-300"} />
        </button>
      ))}
    </div>
  );
}

export default function FeedbackForm({ orderId, outletName, already, ready }: { orderId: number; outletName: string; already: boolean; ready: boolean }) {
  const [rating, setRating] = useState(0);
  const [food, setFood] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">(already ? "done" : "idle");
  const [error, setError] = useState("");

  if (!ready && !already) return <Shell><p className="text-center text-[var(--muted)]">This order isn&apos;t completed yet. Please come back after your meal!</p></Shell>;
  if (state === "done") return <Shell><div className="text-center"><div className="text-5xl">🙏</div><h1 className="mt-3 text-xl font-semibold">Thank you!</h1><p className="mt-1 text-[var(--muted)]">Your feedback helps us serve you better at {outletName}.</p></div></Shell>;

  return (
    <Shell>
      <h1 className="text-center text-xl font-semibold">How was your meal?</h1>
      <p className="mt-1 text-center text-sm text-[var(--muted)]">{outletName}</p>
      <div className="mt-5"><Stars value={rating} onChange={setRating} label="Overall rating" /></div>
      <div className="mt-5 grid grid-cols-2 gap-4"><div><div className="mb-1 text-center text-xs text-[var(--muted)]">Food</div><Stars value={food} onChange={setFood} label="Food rating" /></div><div><div className="mb-1 text-center text-xs text-[var(--muted)]">Service</div><Stars value={service} onChange={setService} label="Service rating" /></div></div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} placeholder="Anything we should know? (optional)" className="input mt-5" />
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button disabled={!rating || state === "busy"} onClick={async () => {
        setState("busy"); setError("");
        const res = await fetch("/api/public/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, rating, foodRating: food || undefined, serviceRating: service || undefined, comment }) });
        if (res.ok || res.status === 409) setState("done"); else { setState("idle"); setError((await res.json()).error ?? "Could not submit"); }
      }} className="btn-primary btn-lg mt-4 w-full">Submit feedback</button>
    </Shell>
  );
}

const Shell = ({ children }: { children: React.ReactNode }) => <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">{children}</main>;
