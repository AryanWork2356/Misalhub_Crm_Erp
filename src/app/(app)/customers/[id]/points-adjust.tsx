"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { adjustPointsAction } from "../../../actions/crm";

export default function PointsAdjust({ customerId }: { customerId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pts, setPts] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost btn-sm">Adjust</button>
      {open && (
        <Modal title="Adjust loyalty points" onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-[var(--muted)]">Use a negative number to remove points.</p>
          <input type="number" className="input" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="e.g. 50 or -20" autoFocus />
          <input className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (e.g. complaint goodwill)" />
          <button disabled={!pts || !note.trim()} onClick={async () => {
            const r = await adjustPointsAction(customerId, Math.round(Number(pts)), note);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Points updated"); setOpen(false); setPts(""); setNote(""); router.refresh();
          }} className="btn-primary btn-lg mt-4 w-full">Apply</button>
        </Modal>
      )}
    </>
  );
}
