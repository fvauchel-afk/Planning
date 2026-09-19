import { PlanPortailLeo } from "@/components/PlanPortailLeo";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function PlanRoute() {
  await requireAdminPage();
  return <PlanPortailLeo />;
}
