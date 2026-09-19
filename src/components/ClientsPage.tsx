"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientFormFields, EMPTY_CLIENT_CREATE } from "@/components/ClientFormFields";
import { devisApi } from "@/lib/devis/client-api";
import { TYPE_CLIENT_LABELS, type ClientCreateInput, type ClientFiche } from "@/lib/devis/types";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

export function ClientsPage() {
  const [rows, setRows] = useState<ClientFiche[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<ClientCreateInput>(EMPTY_CLIENT_CREATE);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await devisApi<{ rows: ClientFiche[] }>("/api/clients");
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
    const hay =
      `${row.nom} ${row.email ?? ""} ${row.ville ?? ""} ${row.telephone ?? ""} ${row.pays ?? ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  async function create() {
    if (!draft.nom.trim()) {
      setError("Le nom du client est obligatoire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await devisApi<{ id: string }>("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setDraft(EMPTY_CLIENT_CREATE);
      setCreating(false);
      await load();
      window.location.href = `/devis/clients/${data.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Fichier client</h2>
          <p className="mt-1 text-sm text-stone-600">
            Chaque devis est rattaché à une fiche. Le dossier OneDrive porte le même nom.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/devis" className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm">
            Devis
          </Link>
          <button
            type="button"
            onClick={() => {
              setDraft(EMPTY_CLIENT_CREATE);
              setCreating(true);
            }}
            className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50"
          >
            Nouveau client
          </button>
        </div>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {creating ? (
        <div className="grid gap-2 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
          <ClientFormFields value={draft} onChange={setDraft} fieldClass={FIELD} />
          <div className="flex gap-2 md:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm text-amber-50"
            >
              Enregistrer
            </button>
            <button type="button" className="text-sm underline" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Recherche…"
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-stone-500">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-stone-600">Aucun client.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Téléphone</th>
                <th className="px-3 py-2 font-medium">Ville</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-stone-200">
                  <td className="px-3 py-2">
                    <Link href={`/devis/clients/${row.id}`} className="font-medium underline">
                      {row.nom}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{TYPE_CLIENT_LABELS[row.type_client]}</td>
                  <td className="px-3 py-2">{row.email || "—"}</td>
                  <td className="px-3 py-2">{row.telephone || "—"}</td>
                  <td className="px-3 py-2">{row.ville || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
