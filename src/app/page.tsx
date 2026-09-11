import { CalendarBoard } from "@/components/CalendarBoard";
import { requireAdminPage } from "@/lib/auth/require-admin-page";

export default async function HomePage() {
  await requireAdminPage();
  return <CalendarBoard />;
}
