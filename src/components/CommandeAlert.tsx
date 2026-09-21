"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { commandeEstOuverte } from "@/lib/commandes";
import { useSession } from "@/lib/auth/session-context";
import { usePlanning } from "@/lib/planning-context";

const STORAGE_SEEN = "vauchel_seen_commande_atelier_ids";

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

  const waiting = (snapshot.commandes ?? []).filter(commandeEstOuverte);
  const seen = typeof window === "undefined" ? [] : readSeen();
  const unseen = waiting.filter((row) => !seen.includes(row.id));

  useEffect(() => {
    if (!session?.isAdmin) return;
    const rows = (snapshot.commandes ?? []).filter(commandeEstOuverte);
    const ids = new Set(rows.map((row) => row.id));
    if (!knownRef.current) {
      knownRef.current = ids;
      return;
    }
    const fresh = rows.filter((row) => !knownRef.current?.has(row.id));
    knownRef.current = ids;
    if (fresh.length === 0 || pathname === "/commandes") return;
    const latest = fresh[0];
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
      if (Notification.permission === "granted") {
        try {
          new Notification("Nouvelle commande", {
            body: `${latest?.nom_client ?? "Chantier"} : à commander`,
          });
        } catch {
          // Certains navigateurs bloquent les notifications hors geste utilisateur.
        }
      }
    }
  }, [snapshot.commandes, pathname, session?.isAdmin]);

  if (!session?.isAdmin || unseen.length === 0 || pathname === "/commandes") {
    return null;
  }

  const latest = unseen[0];

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        {unseen.length > 1
          ? `${unseen.length} commandes à traiter, dont ${latest.nom_client}.`
          : `Commande à traiter : ${latest.nom_client}.`}
      </p>
      <Link
        href="/commandes"
        className="mt-1 inline-block font-medium underline"
        onClick={() => writeSeen([...seen, ...unseen.map((row) => row.id)])}
      >
        Ouvrir Commande
      </Link>
    </div>
  );
}

export function markCommandesSeen(ids: string[]) {
  if (typeof window === "undefined") return;
  writeSeen(Array.from(new Set([...readSeen(), ...ids])));
}
