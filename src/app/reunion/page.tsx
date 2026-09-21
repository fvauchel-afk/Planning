import { ReunionPage } from "@/components/ReunionPage";
import { requireReunionPage } from "@/lib/auth/require-reunion-page";

export default async function ReunionRoute() {
  await requireReunionPage();
  return <ReunionPage />;
}
