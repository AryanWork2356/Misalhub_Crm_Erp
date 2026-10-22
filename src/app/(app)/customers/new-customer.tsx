"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { saveCustomerAction } from "../../actions/crm";

export default function NewCustomer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", birthday: "", address: "" });
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary"><UserPlus size={15} /> Add customer</button>
      {open && (
        <Modal title="New customer" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
            <input className="input" placeholder="Mobile (10 digits)" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
            <div><label className="label">Birthday (optional)</label><input type="date" className="input" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></div>
            <textarea className="input" rows={2} placeholder="Address (for delivery)" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </div>
          <button disabled={f.phone.length !== 10} onClick={async () => {
            const r = await saveCustomerAction({ ...f, birthday: f.birthday || null });
            if (!r.ok) return void toast.error(r.error.includes("unique") ? "A customer with this number already exists" : r.error);
            toast.success("Customer added"); setOpen(false); setF({ name: "", phone: "", birthday: "", address: "" }); router.refresh();
          }} className="btn-primary btn-lg mt-4 w-full">Save customer</button>
        </Modal>
      )}
    </>
  );
}
