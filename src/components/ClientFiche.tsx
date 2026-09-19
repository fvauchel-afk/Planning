"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import { formatMontantFr, totauxDevis } from "@/lib/devis/lignes";
import {
  STATUT_DEVIS_LABELS,
  type ClientFiche,
  type DevisListe,
} from "@/lib/devis/types";
import { formatIsoFr } from "@/lib/dates";
import { useDebouncedPatch } from "@/lib/form-live";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

export function ClientFiche({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [client, setClient] = useState<ClientFiche | null>(null);
  const [devis, setDevis] = useState<DevisListe[]>([]);
  const [form, setForm] = useState({
    nom: "",
    email: "",
    telephone: "",
    adresse: "",
    code_postal: "",
    ville: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(new Set<string>());

  const load = useCallback(async () => {
    const [one, list] = await Promise.all([
      devisApi<{ client: ClientFiche }>(`/api/clients?id=${encodeURIComponent(clientId)}`),
      devisApi<{ rows: DevisListe[] }>(
        `/api/devis?clientId=${encodeURIComponent(clientId)}`,
      ),
    ]);
    setClient(one.client);
    setDevis(list.rows ?? []);
    setForm((current) => ({
      nom: dirty.current.has("nom") ? current.nom : one.client.nom,
      email: dirty.current.has("email") ? current.email : one.client.email ?? "",
      telephone: dirty.current.has("telephone")
        ? current.telephone
        : one.client.telephone ?? "",
      adresse: dirty.current.has("adresse") ? current.adresse : one.client.adresse ?? "",
      code_postal: dirty.current.has("code_postal")
        ? current.code_postal
        : one.client.code_postal ?? "",
      ville: dirty.current.has("ville") ? current.ville : one.client.ville ?? "",
      notes: dirty.current.has("notes") ? current.notes : one.client.notes ?? "",
    }));
  }, [clientId]);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Lecture impossible.");
    });
  }, [load]);

  const applyPatch = useCallback(
    async (payload: Record<string, unknown>) => {
      await devisApi("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, ...payload }),
      });
      Object.keys(payload).forEach((key) => dirty.current.delete(key));
    },
    [clientId],
  );
  const live = useDebouncedPatch(applyPatch);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    dirty.current.add(key);
    if (key === "nom" && !value.trim()) return;
    if (key === "email" && value.trim() && !value.includes("@")) return;
    live.schedule({ [key]: value.trim() || null });
  }

  async function remove() {
    if (!window.confirm("Supprimer cette fiche client ?")) return;
    setBusy(true);
    setError(null);
    try {
      await devisApi("/api/clients", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId }),
      });
      router.replace("/devis/clients");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
      setBusy(false);
    }
  }

  if (!client && !error) {
    return <p className="text-sm text-stone-500">Chargement…</p>;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm">
            <Link href="/devis" className="underline">
              Devis
            </Link>
            {" · "}
            <Link href="/devis/clients" className="underline">
              Fiches clients
            </Link>
          </p>
          <h2 className="mt-1 font-serif text-3xl text-stone-900">
            {form.nom || "Fiche client"}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Les champs s’enregistrent tout seuls.
          </p>
        </div>
        <Link
          href={`/devis/nouveau?client=${encodeURIComponent(clientId)}`}
          className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50"
        >
          Nouveau devis
        </Link>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
        {(
          [
            ["nom", "Nom"],
            ["email", "E-mail"],
            ["telephone", "Téléphone"],
            ["adresse", "Adresse"],
            ["code_postal", "Code postal"],
            ["ville", "Ville"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="mb-1 block font-medium">{label}</span>
            <input
              className={FIELD}
              value={form[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          </label>
        ))}
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Notes internes</span>
          <textarea
            className={`${FIELD} min-h-[4.5rem]`}
            value={form.notes}
            onChange={(event) => update("notes", event.target.value)}
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 font-serif text-xl text-stone-900">Devis</h3>
        {devis.length === 0 ? (
          <p className="text-sm text-stone-600">Aucun devis pour ce client.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-100 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">N°</th>
                  <th className="px-3 py-2 font-medium">Objet</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">TTC</th>
                </tr>
              </thead>
              <tbody>
                {devis.map((row) => (
                  <tr key={row.id} className="border-t border-stone-200">
                    <td className="px-3 py-2">
                      <Link href={`/devis/${row.id}`} className="underline">
                        {row.numero}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.objet || "—"}</td>
                    <td className="px-3 py-2">{formatIsoFr(row.date_devis)}</td>
                    <td className="px-3 py-2">{STATUT_DEVIS_LABELS[row.statut]}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatMontantFr(totauxDevis(row.lignes, row.tva_pct).ttc)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void remove()}
        className="text-sm text-red-800 underline disabled:opacity-50"
      >
        Supprimer la fiche
      </button>
    </section>
  );
}
