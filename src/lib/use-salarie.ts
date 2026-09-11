"use client";

import { useSession } from "@/lib/auth/session-context";

export function useSalarieId() {
  const { session, ready } = useSession();
  return {
    employeeId: session?.employeeId ?? null,
    ready,
  };
}
