"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PwaRegister } from "@/components/PwaRegister";
import { SessionProvider, useSession } from "@/lib/auth/session-context";
import { FormDraftProvider } from "@/lib/form-draft";
import { PlanningProvider } from "@/lib/planning-context";
import { DatabaseUnavailableGate } from "@/components/DatabaseUnavailableGate";
import { DemandesWidget } from "@/components/DemandesWidget";
import { CommandePushPrompt } from "@/components/CommandePushPrompt";

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

function FramedApp({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const login = pathname === "/connexion";

  if (login) {
    return (
      <>
        <PwaRegister />
        <div>{children}</div>
      </>
    );
  }

  return (
    <>
      <div>
        <PlanningProvider>
          <DatabaseUnavailableGate>
            <Shell pathname={pathname}>{children}</Shell>
            <DemandesWidget />
            <CommandePushPrompt />
          </DatabaseUnavailableGate>
        </PlanningProvider>
      </div>
      <PwaRegister />
    </>
  );
}

export function ClientFrame({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FormDraftProvider>
        <FramedApp>{children}</FramedApp>
      </FormDraftProvider>
    </SessionProvider>
  );
}
