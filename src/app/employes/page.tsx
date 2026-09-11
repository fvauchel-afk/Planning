import { EmployeesPage } from "@/components/EmployeesPage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function EmployesRoute() {
  await requireAdminPage();
  return <EmployeesPage />;
}
