"use client";

import { AUTH_OPEN_BANNER, isAuthTemporarilyOpen } from "@/lib/auth/temp-open-check";
import { useSession } from "@/lib/auth/session-context";

export function AuthOpenBanner() {
  const { authTemporarilyOpen, ready } = useSession();
  const visible = ready ? authTemporarilyOpen : isAuthTemporarilyOpen();
  if (!visible) return null;

  return (
    <div
      role="status"
      className="border-b-2 border-red-800 bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
    >
      {AUTH_OPEN_BANNER}
    </div>
  );
}
