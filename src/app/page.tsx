import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HOME } from "@/lib/permissions";

export default async function Home() {
  const session = await getSession();
  redirect(session ? HOME[session.role] : "/login");
}
