"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [locked, setLocked] = useState(false);
  const appRef = useRef<HTMLDivElement>(null);
  const onLockChange = useCallback((next: boolean) => {
    setLocked(next);
  }, []);

  useEffect(() => {
    const node = appRef.current;
    if (!node) return;
    if (locked) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }, [locked]);

  if (login) {
    return (
      <>
        <PwaRegister onLockChange={onLockChange} />
        <div>{children}</div>
      </>
    );
  }

  return (
    <>
      <div
        ref={appRef}
        aria-hidden={locked || undefined}
        className={
          locked ? "pointer-events-none max-h-screen overflow-hidden" : undefined
        }
      >
        <PlanningProvider>
          <DatabaseUnavailableGate>
            <Shell pathname={pathname}>{children}</Shell>
            <DemandesWidget />
            <CommandePushPrompt />
          </DatabaseUnavailableGate>
        </PlanningProvider>
      </div>
      <PwaRegister onLockChange={onLockChange} />
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
