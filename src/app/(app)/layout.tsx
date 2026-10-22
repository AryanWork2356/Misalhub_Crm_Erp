import { currentOutletId, requireUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isHeadOffice, ROLE_ACCESS } from "@/lib/permissions";
import Shell from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const db = await getDb();
  const outletId = await currentOutletId(user);
  const [outlet] = await db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId));
  const outletList = isHeadOffice(user.role)
    ? await db.select({ id: schema.outlets.id, name: schema.outlets.name }).from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id)
    : [];
  return (
    <Shell
      user={{ name: user.name, role: user.role }}
      outlet={{ id: outlet.id, name: outlet.name }}
      outlets={outletList}
      modules={ROLE_ACCESS[user.role]}
    >
      {children}
    </Shell>
  );
}
