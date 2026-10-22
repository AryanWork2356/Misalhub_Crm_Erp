"use client";

import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { CAMPAIGN_TEMPLATES, fillTemplate, waLink, SEGMENT_LABEL, SEGMENT_STYLE, type Segment } from "@/lib/crm";
import { fmt } from "@/lib/money";

export type Target = { id: number; name: string; phone: string; segment: Segment; spent: number; lastVisit: string; birthdaySoon: boolean; birthdayToday: boolean };

export default function Campaigns({ targets }: { targets: Target[] }) {
  const [tplId, setTplId] = useState("winback");
  const tpl = CAMPAIGN_TEMPLATES.find((t) => t.id === tplId)!;
  const [text, setText] = useState(tpl.text);
  const [sent, setSent] = useState<Set<number>>(new Set());

  const audience = useMemo(() => targets.filter((t) => tpl.segment === "all" ? true : tpl.segment === "birthday" ? t.birthdaySoon : t.segment === tpl.segment), [targets, tpl]);

  function choose(id: string) {
    const t = CAMPAIGN_TEMPLATES.find((x) => x.id === id)!;
    setTplId(id); setText(t.text); setSent(new Set());
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="card h-fit p-4">
        <h3 className="mb-2 text-sm font-semibold">1. Pick a campaign</h3>
        <div className="space-y-1.5">
          {CAMPAIGN_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => choose(t.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${tplId === t.id ? "border-brand-500 bg-brand-50" : "border-[var(--border)] hover:bg-stone-50"}`}>
              <span className="font-medium">{t.label}</span>
              <span className="text-xs text-[var(--muted)]">{targets.filter((x) => t.segment === "all" ? true : t.segment === "birthday" ? x.birthdaySoon : x.segment === t.segment).length}</span>
            </button>
          ))}
        </div>
        <h3 className="mb-2 mt-4 text-sm font-semibold">2. Edit the message</h3>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="input" />
        <p className="mt-1 text-xs text-[var(--muted)]">{"{name}"} is replaced with each customer&apos;s first name. Only customers who opted in are listed.</p>
      </section>
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-semibold">3. Send ({audience.length} customers · {sent.size} done)</h3>
          <span className="text-xs text-[var(--muted)]">Opens WhatsApp with the message ready — you press send.</span>
        </div>
        <div className="max-h-[560px] divide-y divide-stone-100 overflow-y-auto">
          {audience.map((a) => {
            const msg = fillTemplate(text, a);
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.name || "Unnamed"} <span className={`badge ml-1 ${SEGMENT_STYLE[a.segment]}`}>{SEGMENT_LABEL[a.segment]}</span>{a.birthdayToday && <span className="ml-1">🎂</span>}</div>
                  <div className="text-xs text-[var(--muted)]">{a.phone} · last visit {a.lastVisit} · {fmt(a.spent)} spent</div>
                </div>
                <button onClick={async () => { await navigator.clipboard.writeText(msg); toast.success("Message copied"); }} className="rounded-md p-2 text-stone-500 hover:bg-stone-100" aria-label="Copy message"><Copy size={15} /></button>
                <a href={waLink(a.phone, msg)} target="_blank" rel="noreferrer" onClick={() => setSent((s) => new Set(s).add(a.id))} className={sent.has(a.id) ? "btn-ghost btn-sm" : "btn-primary btn-sm"}>
                  {sent.has(a.id) ? <><Check size={13} /> Sent</> : <><MessageCircle size={13} /> WhatsApp</>}
                </a>
              </div>
            );
          })}
          {audience.length === 0 && <p className="py-12 text-center text-sm text-[var(--muted)]">Nobody in this audience right now.</p>}
        </div>
      </section>
    </div>
  );
}
