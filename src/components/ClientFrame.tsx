"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SessionProvider, useSession } from "@/lib/auth/session-context";
import { PlanningProvider } from "@/lib/planning-context";

function Shell({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  const { session, ready } = useSession();
  const salarie = ready && session && !session.isAdmin;
  const mobile = pathname.startsWith("/moi");
  if (salarie || mobile) return <>{children}</>;
  return <AppShell currentPath={pathname}>{children}</AppShell>;
}

export function ClientFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/connexion";

  if (login) {
    return <SessionProvider>{children}</SessionProvider>;
  }

  return (
    <SessionProvider>
      <PlanningProvider>
        <Shell pathname={pathname}>{children}</Shell>
      </PlanningProvider>
    </SessionProvider>
  );
}
