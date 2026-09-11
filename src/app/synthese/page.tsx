import { SynthesePage } from "@/components/SynthesePage";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function SyntheseRoute() {
  await requireAdminPage();
  return <SynthesePage />;
}
