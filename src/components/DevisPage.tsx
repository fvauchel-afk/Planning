"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import { formatMontantFr, totauxDevis } from "@/lib/devis/lignes";
import { formatIsoFr } from "@/lib/dates";
import {
  STATUT_DEVIS_LABELS,
  type DevisListe,
  type StatutDevis,
} from "@/lib/devis/types";

const TON: Record<StatutDevis, string> = {
  brouillon: "bg-stone-100 text-stone-800",
  envoye: "bg-sky-100 text-sky-900",
  accepte: "bg-emerald-100 text-emerald-900",
  refuse: "bg-red-100 text-red-900",
};

export function DevisPage() {
  const [rows, setRows] = useState<DevisListe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<StatutDevis | "tous">("tous");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await devisApi<{ rows: DevisListe[] }>("/api/devis");
      setRows(data.rows ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lecture impossible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((row) => {
    if (filtre !== "tous" && row.statut !== filtre) return false;
    const hay = `${row.numero} ${row.client_nom} ${row.objet}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Devis</h2>
          <p className="mt-1 text-sm text-stone-600">
            Fichier client, PDF, envoi depuis le Hotmail OneDrive, copie dans le dossier
            client.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/parametres/devis" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            Paramètres Devis
          </Link>
          <Link href="/devis/clients" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            Fichier client
          </Link>
          <Link href="/devis/nouveau" className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50">
            Nouveau devis
          </Link>
        </div>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Recherche…"
          className="min-w-[12rem] flex-1 rounded border border-stone-300 px-3 py-2 text-sm"
        />
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as StatutDevis | "tous")}
          className="rounded border border-stone-300 px-3 py-2 text-sm"
        >
          <option value="tous">Tous</option>
          {Object.entries(STATUT_DEVIS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-stone-600">Aucun devis.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Objet</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Statut</th>
                <th className="px-3 py-2 font-medium">TTC</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const ttc = totauxDevis(row.lignes, row.opt_remise ? row.remise : null).ttc;
                return (
                  <tr key={row.id} className="border-t border-stone-200">
                    <td className="px-3 py-2">
                      <Link href={`/devis/${row.id}`} className="font-medium underline">
                        {row.numero}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/devis/clients/${row.client_id}`} className="underline">
                        {row.client_nom || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.objet || "—"}</td>
                    <td className="px-3 py-2">{formatIsoFr(row.date_emission)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TON[row.statut]}`}>
                        {STATUT_DEVIS_LABELS[row.statut]}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMontantFr(ttc)} €</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
