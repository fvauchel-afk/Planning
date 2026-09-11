"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ClientSession = {
  employeeId: string;
  nom: string;
  isAdmin: boolean;
};

type SessionContextValue = {
  session: ClientSession | null;
  ready: boolean;
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null);
  const [ready, setReady] = useState(false);

  async function refreshSession() {
    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        setSession(null);
        return;
      }
      const data = (await response.json()) as { user?: ClientSession | null };
      setSession(data.user ?? null);
    } catch {
      setSession(null);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void refreshSession();
  }, []);

  return (
    <SessionContext.Provider value={{ session, ready, refreshSession }}>
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
