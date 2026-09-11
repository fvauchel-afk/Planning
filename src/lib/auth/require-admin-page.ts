import { redirect } from "next/navigation";
import { lookupEmployeeAccess } from "@/lib/auth/employee-access";
import { getSession } from "@/lib/auth/guard";

export async function requireAdminPage() {
  const session = await getSession();
  if (!session) redirect("/connexion");
  const access = await lookupEmployeeAccess(session.employeeId);
  const isAdmin = access ? access.isAdmin : session.isAdmin === true;
  if (!isAdmin || access?.actif === false) {
    redirect("/moi");
  }
}
