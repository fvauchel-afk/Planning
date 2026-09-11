"use client";

import { useSession } from "@/lib/auth/session-context";

export function useSalarieId() {
  const { session, ready } = useSession();
  return {
    employeeId: session?.employeeId ?? null,
    ready,
    setEmployeeId: (_id: string | null) => {
      // Identité verrouillée sur la session PIN.
    },
  };
}
