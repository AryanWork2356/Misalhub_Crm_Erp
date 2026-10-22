"use client";

import { useEffect } from "react";
import { X, Printer } from "lucide-react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92vh] w-full flex-col rounded-2xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-stone-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}


export function PrintDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3">{children}</div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => window.print()} className="btn-primary flex-1"><Printer size={16} /> Print</button>
        <button onClick={onClose} className="btn-ghost">Done</button>
      </div>
    </Modal>
  );
}
