"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ClientSession = {
  employeeId: string;
  nom: string;
  isAdmin: boolean;
  canRestore?: boolean;
  canReceiveCommandes?: boolean;
  canReceiveLancementAlerts?: boolean;
};

type SessionContextValue = {
  session: ClientSession | null;
  ready: boolean;
  authTemporarilyOpen: boolean;
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [ready, setReady] = useState(false);
  const [authTemporarilyOpen, setAuthTemporarilyOpen] = useState(false);

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/me");
      const data = (await response.json()) as {
        user?: ClientSession | null;
        authTemporarilyOpen?: boolean;
      };
      setAuthTemporarilyOpen(data.authTemporarilyOpen === true);
      if (!response.ok) {
        setSession(null);
        return;
      }
      setSession(data.user ?? null);
    } catch {
      setSession(null);
      setAuthTemporarilyOpen(false);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <SessionContext.Provider
      value={{ session, ready, authTemporarilyOpen, refreshSession }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
