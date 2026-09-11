"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { OnedriveBanner } from "@/components/OnedriveBanner";
import { useSession } from "@/lib/auth/session-context";

const ADMIN_LINKS: { href: string; label: string; desktopOnly?: boolean }[] = [
  { href: "/", label: "Planning" },
  { href: "/synthese", label: "Synthèse" },
  { href: "/chantiers/nouveau", label: "Nouveau chantier" },
  { href: "/employes", label: "Employés" },
  { href: "/absences", label: "Absences" },
  { href: "/signalements", label: "Signalements", desktopOnly: true },
  { href: "/admin/onedrive", label: "OneDrive", desktopOnly: true },
  { href: "/moi", label: "Mon planning" },
];

const SALARIE_LINKS: { href: string; label: string }[] = [
  { href: "/moi", label: "Mon planning" },
  { href: "/moi/retard", label: "Signalements" },
];

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  const router = useRouter();
  const { session, ready } = useSession();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  const links =
    !ready || !session
      ? []
      : session.isAdmin
        ? ADMIN_LINKS
        : SALARIE_LINKS;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-800 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-500">
              Métallerie
            </p>
            <h1 className="font-serif text-xl leading-tight text-stone-50">
              Ferronnerie Vauchel
            </h1>
            {session?.nom && (
              <p className="text-xs text-stone-400">{session.nom}</p>
            )}
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {links.map((link) => {
              const active =
                link.href === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(link.href);
              const desktopOnly =
                "desktopOnly" in link ? Boolean(link.desktopOnly) : false;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    desktopOnly ? "hidden md:inline-flex" : ""
                  } ${
                    active
                      ? "bg-amber-700 text-amber-50"
                      : "text-stone-300 hover:bg-stone-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <OnedriveBanner />
        {children}
      </main>
    </div>
  );
}
