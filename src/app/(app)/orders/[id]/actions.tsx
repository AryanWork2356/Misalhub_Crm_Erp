"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, Undo2, Pencil } from "lucide-react";
import Link from "next/link";
import { refundOrderAction } from "../../../actions/orders";
import { Modal } from "@/components/modal";

export default function OrderActions({ orderId, status, canRefund, paid }: { orderId: number; status: string; canRefund: boolean; paid: number }) {
  const router = useRouter();
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState("");
  const open = !["completed", "cancelled"].includes(status);
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => window.print()} className="btn-ghost"><Printer size={15} /> Print bill</button>
      {open && <Link href={`/pos?order=${orderId}`} className="btn-primary"><Pencil size={15} /> Open in POS</Link>}
      {canRefund && paid > 0 && status !== "cancelled" && <button onClick={() => setRefund(true)} className="btn-ghost text-red-600"><Undo2 size={15} /> Refund</button>}
      {refund && (
        <Modal title="Refund this order?" onClose={() => setRefund(false)}>
          <p className="text-sm text-[var(--muted)]">All payments will be reversed and the order marked cancelled. This is recorded in the audit log.</p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="input mt-3" autoFocus />
          <button disabled={!reason.trim()} onClick={async () => {
            const r = await refundOrderAction(orderId, reason);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Refunded"); setRefund(false); router.refresh();
          }} className="btn-danger btn-lg mt-4 w-full">Confirm refund</button>
        </Modal>
      )}
    </div>
  );
}
