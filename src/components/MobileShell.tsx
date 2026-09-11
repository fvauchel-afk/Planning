"use client";

import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

export function MobileShell({
  children,
  employeeName,
}: {
  children: React.ReactNode;
  employeeName?: string;
}) {
  const router = useRouter();
  const { session } = useSession();
  const name = employeeName ?? session?.nom;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f3efe6]">
      <header className="sticky top-0 z-20 border-b border-stone-800 bg-stone-900 px-4 py-3 text-stone-100">
        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-500">
          Ferronnerie Vauchel
        </p>
        <div className="mt-0.5 flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-xl">Mon planning</h1>
          {name && (
            <button
              type="button"
              className="text-xs text-amber-200 underline"
              onClick={() => void logout()}
            >
              {name} · déconnexion
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
    </div>
  );
}
