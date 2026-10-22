"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { askAssistantAction } from "../../actions/assistant";

const SUGGESTIONS = [
  "Why were sales lower than last week and what should I do?",
  "Which items should I promote and which should I drop?",
  "How can I reduce food cost?",
  "What should I prep for the weekend rush?",
];

export default function AskAssistant() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<{ q: string; a?: string; error?: string }[]>([]);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setQ("");
    setTurns((t) => [{ q: text }, ...t]);
    const r = await askAssistantAction(text);
    setTurns((t) => t.map((x, i) => (i === 0 ? (r.ok ? { q: text, a: r.answer } : { q: text, error: r.error }) : x)));
    setBusy(false);
  }

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-brand-500" /> Ask your business</h2>
      <p className="mt-0.5 text-sm text-[var(--muted)]">Ask in plain English. Answers use your last 30 days of sales, costs, stock and menu data — no customer names or phone numbers are shared.</p>
      <form onSubmit={(e) => { e.preventDefault(); void ask(q); }} className="mt-3 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="e.g. Which day should I run an offer?" className="input" aria-label="Your question" />
        <button disabled={busy || q.trim().length < 3} className="btn-primary">{busy ? <Loader2 size={15} className="animate-spin" /> : "Ask"}</button>
      </form>
      {turns.length === 0 && <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} onClick={() => void ask(s)} className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs text-stone-600 hover:bg-stone-50">{s}</button>)}</div>}
      <div className="mt-4 space-y-4">
        {turns.map((t, i) => (
          <div key={i}>
            <div className="text-sm font-medium">{t.q}</div>
            {t.error ? <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.error}</p>
              : t.a ? <p className="mt-1 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2.5 text-sm leading-relaxed">{t.a}</p>
              : <p className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]"><Loader2 size={14} className="animate-spin" /> Looking at your numbers…</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
