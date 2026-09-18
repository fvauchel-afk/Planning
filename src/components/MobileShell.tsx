"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthOpenBanner } from "@/components/AuthOpenBanner";
import { BrandMark } from "@/components/BrandMark";
import { useSession } from "@/lib/auth/session-context";

export function MobileShell({
  children,
  employeeName,
}: {
  children: React.ReactNode;
  employeeName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const name = employeeName ?? session?.nom;
  const isAdmin = session?.isAdmin === true;
  const homeHref = isAdmin ? "/" : "/moi";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#f3efe6]">
      <AuthOpenBanner />
      <header className="sticky top-0 z-20 border-b border-stone-800 bg-stone-900 px-4 py-3 text-stone-100">
        <Link
          href={homeHref}
          className="inline-block rounded-md outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <BrandMark variant="dark" size="sm" />
        </Link>
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
        <nav className="mt-3 flex flex-wrap gap-1">
          {isAdmin ? (
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-stone-300 hover:bg-stone-800"
            >
              Planning
            </Link>
          ) : null}
          <Link
            href="/moi"
            className={`rounded-md px-3 py-1.5 text-sm ${
              pathname === "/moi"
                ? "bg-amber-700 text-amber-50"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            Mon planning
          </Link>
          <Link
            href="/moi/conges"
            className={`rounded-md px-3 py-1.5 text-sm ${
              pathname.startsWith("/moi/conges")
                ? "bg-amber-700 text-amber-50"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            Mes congés
          </Link>
          <Link
            href="/moi/retard"
            className={`rounded-md px-3 py-1.5 text-sm ${
              pathname.startsWith("/moi/retard")
                ? "bg-amber-700 text-amber-50"
                : "text-stone-300 hover:bg-stone-800"
            }`}
          >
            Signalements
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-lg px-4 py-4">{children}</main>
    </div>
  );
}
