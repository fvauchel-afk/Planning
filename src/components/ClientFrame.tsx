"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SessionProvider } from "@/lib/auth/session-context";
import { PlanningProvider } from "@/lib/planning-context";

export function ClientFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/connexion";
  const mobile = pathname.startsWith("/moi");

  if (login) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <PlanningProvider>
        {mobile ? children : <AppShell currentPath={pathname}>{children}</AppShell>}
      </PlanningProvider>
    </SessionProvider>
  );
}
