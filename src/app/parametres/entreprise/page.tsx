import { requireAdminPage } from "@/lib/auth/require-admin-page";
import { redirect } from "next/navigation";

export default async function EntrepriseRedirect() {
  await requireAdminPage();
  redirect("/parametres");
}
