import { currentOutletId, requireUser } from "@/lib/auth";
import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { isHeadOffice, ROLE_ACCESS } from "@/lib/permissions";
import Shell from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const db = await getDb();
  const outletId = await currentOutletId(user);
  // independent lookups: run together (each is a network round trip to the database)
  const [[outlet], outletList] = await Promise.all([
    db.select().from(schema.outlets).where(eq(schema.outlets.id, outletId)),
    isHeadOffice(user.role)
      ? db.select({ id: schema.outlets.id, name: schema.outlets.name }).from(schema.outlets).where(eq(schema.outlets.active, true)).orderBy(schema.outlets.id)
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);
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
