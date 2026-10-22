"use client";

import { useActionState, useState } from "react";
import { Delete, Loader2 } from "lucide-react";
import { loginAction } from "../actions/auth";

export default function LoginForm() {
  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-3 lg:hidden">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500 text-xl">🍲</div>
        <div className="text-lg font-semibold">Misal Hub OS</div>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">Sign in to start your shift.</p>

      <div className="mt-6 grid grid-cols-2 rounded-lg bg-stone-100 p-1 text-sm font-medium">
        {(["pin", "password"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-md py-1.5 transition ${mode === m ? "bg-white shadow-sm" : "text-[var(--muted)]"}`}>
            {m === "pin" ? "Staff PIN" : "Password"}
          </button>
        ))}
      </div>

      <input type="hidden" name="mode" value={mode} />
      <div className="mt-5">
        <label className="label" htmlFor="phone">Mobile number</label>
        <input id="phone" name="phone" inputMode="numeric" autoComplete="username" placeholder="10-digit mobile" className="input" required />
      </div>

      {mode === "password" ? (
        <div className="mt-4" key="password-mode">
          <label className="label" htmlFor="secret">Password</label>
          <input id="secret" name="secret" type="password" autoComplete="current-password" className="input" required />
        </div>
      ) : (
        <div className="mt-4" key="pin-mode">
          <label className="label">PIN</label>
          <input type="hidden" name="secret" value={pin} />
          <div className="mb-3 flex justify-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`h-3 w-3 rounded-full ${i < pin.length ? "bg-brand-500" : "bg-stone-200"}`} />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? <div key={i} /> : (
                <button key={i} type="button" onClick={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 6 ? p + k : p))}
                  className="grid h-12 place-items-center rounded-lg border border-[var(--border)] bg-white text-lg font-medium active:bg-stone-100">
                  {k === "⌫" ? <Delete size={18} /> : k}
                </button>
              ))}
          </div>
        </div>
      )}

      {state?.error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending || (mode === "pin" && pin.length < 4)} className="btn-primary btn-lg mt-5 w-full">
        {pending && <Loader2 size={16} className="animate-spin" />} Sign in
      </button>
    </form>
  );
}
