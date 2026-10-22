import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HOME } from "@/lib/permissions";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(HOME[session.role]);
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-400/50" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-600/60" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-2xl">🍲</div>
          <div className="text-xl font-semibold tracking-tight">Misal Hub OS</div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Authentic flavours, run with precision.</h1>
          <p className="mt-4 text-brand-50/90">Billing, kitchen, inventory, customers and franchise outlets — one system for every Misal Hub counter.</p>
        </div>
        <div className="relative text-sm text-brand-50/80">Mira Road East · Since 2015</div>
      </section>
      <section className="flex items-center justify-center p-6">
        <LoginForm />
      </section>
    </main>
  );
}
