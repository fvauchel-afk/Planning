"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthOpenBanner } from "@/components/AuthOpenBanner";
import { OnedriveBanner } from "@/components/OnedriveBanner";
import { CommandeAlert } from "@/components/CommandeAlert";
import { LancementAlert } from "@/components/LancementAlert";
import { AdministratifIdleAlert } from "@/components/AdministratifIdleAlert";
import { AdminDesktopNav, AdminMobileNav, AdminSectionTabs } from "@/components/AdminNav";
import { lancementsEnAttente } from "@/lib/dates-estimatives";
import { demandeEstOuverte, isReunionDirectionDemande } from "@/lib/demandes";
import { adminNavForSession } from "@/lib/nav/admin-nav";
import { useSession } from "@/lib/auth/session-context";
import { BrandMark } from "@/components/BrandMark";
import { usePlanning } from "@/lib/planning-context";

const SALARIE_LINKS: { href: string; label: string }[] = [
  { href: "/moi", label: "Mon planning" },
  { href: "/moi/conges", label: "Mes congés" },
  { href: "/moi/retard", label: "Signalements" },
];

function linkActive(href: string, currentPath: string) {
  return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
}

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  const router = useRouter();
  const { session, ready } = useSession();
  const { snapshot, saveNotice, clearSaveNotice } = usePlanning();
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingCommandes =
    session?.canReceiveCommandes
      ? (snapshot.demandes ?? []).filter(
          (row) =>
            row.categorie === "commande" &&
            row.statut !== "traite" &&
            !row.archivee,
        ).length
      : 0;
  const pendingLancements = session?.canReceiveLancementAlerts
    ? lancementsEnAttente(snapshot).length
    : 0;

  const pendingReunion =
    session?.canManageReunionDirection
      ? (snapshot.demandes ?? []).filter(
          (row) =>
            isReunionDirectionDemande(row) &&
            demandeEstOuverte(row) &&
            !row.archivee,
        ).length
      : 0;

  const adminItems = useMemo(
    () => adminNavForSession(Boolean(session?.canManageReunionDirection)),
    [session?.canManageReunionDirection],
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [currentPath]);

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/connexion");
    router.refresh();
  }

  const salarieLinks = !ready || !session || session.isAdmin ? [] : SALARIE_LINKS;
  const showAdminNav = Boolean(ready && session?.isAdmin);

  return (
    <div className="min-h-screen">
      <AuthOpenBanner />
      <header className="sticky top-0 z-30 border-b border-stone-800 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link
              href={session?.isAdmin ? "/" : "/moi"}
              className="block rounded-md outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <BrandMark variant="dark" />
            </Link>
            {session?.nom && (
              <p className="truncate text-xs text-stone-400">{session.nom}</p>
            )}
          </div>

          {showAdminNav ? (
            <div className="hidden items-center gap-1 md:flex">
              <AdminDesktopNav
                items={adminItems}
                currentPath={currentPath}
                pendingCommandes={pendingCommandes}
                pendingReunion={pendingReunion}
                pendingLancements={pendingLancements}
              />
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
              >
                Déconnexion
              </button>
            </div>
          ) : (
            <nav className="hidden flex-wrap items-center justify-end gap-1 md:flex">
              {salarieLinks.map((link) => {
                const active = linkActive(link.href, currentPath);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      active
                        ? "bg-amber-700 text-amber-50"
                        : "text-stone-300 hover:bg-stone-800 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {ready && session ? (
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md px-3 py-1.5 text-sm text-stone-400 hover:bg-stone-800 hover:text-white"
                >
                  Déconnexion
                </button>
              ) : null}
            </nav>
          )}

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-md px-2 py-2 text-xs text-stone-300 hover:bg-stone-800"
            >
              Déconnexion
            </button>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="app-mobile-menu"
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-stone-600 text-xl leading-none text-stone-100 hover:bg-stone-800"
            >
              {menuOpen ? "×" : "☰"}
            </button>
          </div>
        </div>

        {showAdminNav ? (
          <AdminSectionTabs
            items={adminItems}
            currentPath={currentPath}
            pendingCommandes={pendingCommandes}
            pendingReunion={pendingReunion}
            pendingLancements={pendingLancements}
          />
        ) : null}

        {menuOpen && (
          <div
            id="app-mobile-menu"
            className="border-t border-stone-800 bg-stone-900 md:hidden"
          >
            {showAdminNav ? (
              <>
                <AdminMobileNav
                  items={adminItems}
                  currentPath={currentPath}
                  pendingCommandes={pendingCommandes}
                  pendingReunion={pendingReunion}
                  pendingLancements={pendingLancements}
                  onNavigate={() => setMenuOpen(false)}
                />
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="w-full rounded-md px-3 py-3 text-left text-base text-stone-400 hover:bg-stone-800"
                  >
                    Déconnexion
                  </button>
                </div>
              </>
            ) : (
              <nav className="mx-auto flex max-w-[1600px] flex-col gap-1 px-3 py-3">
                {salarieLinks.map((link) => {
                  const active = linkActive(link.href, currentPath);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`rounded-md px-3 py-3 text-base ${
                        active
                          ? "bg-amber-700 text-amber-50"
                          : "text-stone-200 hover:bg-stone-800"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-md px-3 py-3 text-left text-base text-stone-400 hover:bg-stone-800"
                >
                  Déconnexion
                </button>
              </nav>
            )}
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <OnedriveBanner />
        {saveNotice ? (
          <div
            className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
              saveNotice.kind === "error"
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <p>{saveNotice.message}</p>
            <button
              type="button"
              onClick={() => clearSaveNotice()}
              className="shrink-0 rounded px-2 py-1 text-xs underline"
            >
              Fermer
            </button>
          </div>
        ) : null}
        <CommandeAlert />
        <LancementAlert />
        <AdministratifIdleAlert />
        {children}
      </main>
    </div>
  );
}
