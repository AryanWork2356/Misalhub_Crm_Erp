"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "@/lib/money";
import { deleteModifierAction, saveModifierAction, saveModifierGroupAction } from "../../actions/menu";

type Group = { id: number; name: string; minSelect: number; maxSelect: number; mods: { id: number; name: string; price: number; isDefault: boolean }[] };

export default function ModifierManager({ groups, canEdit }: { groups: Group[]; canEdit: boolean }) {
  const router = useRouter();
  const [gName, setGName] = useState("");
  const [drafts, setDrafts] = useState<Record<number, { name: string; price: string }>>({});
  const done = async (p: Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await p;
    if (!r.ok) return void toast.error(r.error);
    toast.success(msg); router.refresh();
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => (
        <section key={g.id} className="card p-4">
          <div className="flex items-baseline justify-between"><h3 className="font-semibold">{g.name}</h3><span className="text-xs text-[var(--muted)]">{g.minSelect > 0 ? "required · " : "optional · "}pick up to {g.maxSelect}</span></div>
          <ul className="mt-2 divide-y divide-stone-100">
            {g.mods.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{m.name} {m.isDefault && <span className="badge bg-stone-100 text-stone-600">default</span>}</span>
                <span className="flex items-center gap-2"><span className="text-[var(--muted)]">{m.price ? `+${fmt(m.price)}` : "free"}</span>
                  {canEdit && <button onClick={() => done(deleteModifierAction(m.id), "Removed")} className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-red-600" aria-label={`Delete ${m.name}`}><Trash2 size={14} /></button>}</span>
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="mt-3 flex gap-2">
              <input value={drafts[g.id]?.name ?? ""} onChange={(e) => setDrafts({ ...drafts, [g.id]: { name: e.target.value, price: drafts[g.id]?.price ?? "" } })} placeholder="New option" className="input" />
              <input value={drafts[g.id]?.price ?? ""} onChange={(e) => setDrafts({ ...drafts, [g.id]: { name: drafts[g.id]?.name ?? "", price: e.target.value } })} placeholder="₹" type="number" min={0} className="input w-20" />
              <button onClick={() => done(saveModifierAction({ groupId: g.id, name: drafts[g.id]?.name ?? "", price: Math.round(Number(drafts[g.id]?.price || 0) * 100) }).then((r) => { setDrafts({ ...drafts, [g.id]: { name: "", price: "" } }); return r; }), "Added")} className="btn-dark" aria-label="Add option"><Plus size={16} /></button>
            </div>
          )}
        </section>
      ))}
      {canEdit && (
        <section className="card flex items-end gap-2 border-dashed p-4">
          <div className="flex-1"><label className="label">New modifier group</label><input value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Sweetness" className="input" /></div>
          <button disabled={gName.trim().length < 2} onClick={() => done(saveModifierGroupAction({ name: gName, minSelect: 0, maxSelect: 1 }).then((r) => { setGName(""); return r; }), "Group created")} className="btn-primary">Create</button>
        </section>
      )}
    </div>
  );
}
