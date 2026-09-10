"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PlanningProvider } from "@/lib/planning-context";

export function ClientFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mobile = pathname.startsWith("/moi");
  return (
    <PlanningProvider>
      {mobile ? children : <AppShell currentPath={pathname}>{children}</AppShell>}
    </PlanningProvider>
  );
}
