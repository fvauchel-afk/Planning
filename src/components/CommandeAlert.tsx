"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";
import { usePlanning } from "@/lib/planning-context";

const STORAGE_SEEN = "vauchel_seen_commande_ids";

function readSeen(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_SEEN);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeSeen(ids: string[]) {
  window.localStorage.setItem(STORAGE_SEEN, JSON.stringify(ids.slice(0, 200)));
}

export function CommandeAlert() {
  const pathname = usePathname();
  const { session } = useSession();
  const { snapshot } = usePlanning();
  const knownRef = useRef<Set<string> | null>(null);

  const waiting = (snapshot.demandes ?? []).filter(
    (row) =>
      row.categorie === "commande" && row.statut !== "traite" && !row.archivee,
  );
  const seen = typeof window === "undefined" ? [] : readSeen();
  const unseen = waiting.filter((row) => !seen.includes(row.id));

  useEffect(() => {
    if (!session?.canReceiveCommandes) return;
    const rows = (snapshot.demandes ?? []).filter(
      (row) =>
        row.categorie === "commande" &&
        row.statut !== "traite" &&
        !row.archivee,
    );
    const ids = new Set(rows.map((row) => row.id));
    if (!knownRef.current) {
      knownRef.current = ids;
      return;
    }
    const fresh = rows.filter((row) => !knownRef.current?.has(row.id));
    knownRef.current = ids;
    if (fresh.length === 0 || pathname === "/demandes") return;
    const latest = fresh[0];
    const auteur =
      snapshot.employees.find((item) => item.id === latest?.employe_id)?.nom ??
      "un salarié";
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        try {
          new Notification("Nouvelle commande", {
            body: `${auteur} : ${(latest?.message ?? "").slice(0, 120)}`,
          });
        } catch {
          // Certains navigateurs bloquent les notifications hors geste utilisateur.
        }
      }
    }
  }, [
    snapshot.demandes,
    snapshot.employees,
    pathname,
    session?.canReceiveCommandes,
  ]);

  if (
    !session?.canReceiveCommandes ||
    unseen.length === 0 ||
    pathname === "/demandes"
  ) {
    return null;
  }

  const latest = unseen[0];
  const auteur =
    snapshot.employees.find((item) => item.id === latest.employe_id)?.nom ??
    "un salarié";

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        {unseen.length > 1
          ? `${unseen.length} nouvelles commandes, dont une de ${auteur}.`
          : `Nouvelle commande de ${auteur}.`}
      </p>
      <Link
        href="/demandes"
        className="mt-1 inline-block font-medium underline"
        onClick={() => writeSeen([...seen, ...unseen.map((row) => row.id)])}
      >
        Ouvrir Demandes
      </Link>
    </div>
  );
}

export function markCommandesSeen(ids: string[]) {
  if (typeof window === "undefined") return;
  writeSeen(Array.from(new Set([...readSeen(), ...ids])));
}
