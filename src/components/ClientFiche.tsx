"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import { formatMontantFr, totauxDevis } from "@/lib/devis/lignes";
import { formatIsoFr } from "@/lib/dates";
import {
  STATUT_DEVIS_LABELS,
  TYPE_CLIENT_LABELS,
  TYPES_CLIENT,
  type ClientFiche as ClientRow,
  type DevisListe,
  type TypeClient,
} from "@/lib/devis/types";
import { useDebouncedPatch } from "@/lib/form-live";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

export function ClientFiche({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [devis, setDevis] = useState<DevisListe[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(new Set<string>());

  const applyPatch = useCallback(
    async (payload: Record<string, unknown>) => {
      await devisApi("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, ...payload }),
      });
      Object.keys(payload).forEach((k) => dirty.current.delete(k));
    },
    [clientId],
  );
  const live = useDebouncedPatch(applyPatch);

  function setField<K extends keyof ClientRow>(key: K, value: ClientRow[K]) {
    dirty.current.add(String(key));
    setClient((cur) => (cur ? { ...cur, [key]: value } : cur));
    live.schedule({ [key]: value });
  }

  useEffect(() => {
    void Promise.all([
      devisApi<{ client: ClientRow }>(`/api/clients?id=${encodeURIComponent(clientId)}`),
      devisApi<{ rows: DevisListe[] }>(`/api/devis?clientId=${encodeURIComponent(clientId)}`),
    ])
      .then(([c, d]) => {
        setClient(c.client);
        setDevis(d.rows ?? []);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lecture impossible.");
      });
  }, [clientId]);

  async function remove() {
    if (!window.confirm("Supprimer cette fiche ? Impossible s’il reste des devis.")) return;
    setBusy(true);
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
  if (!client) {
    return (
      <section className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        <Link href="/devis/clients" className="underline">
          Retour
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm">
            <Link href="/devis/clients" className="underline">
              Fichier client
            </Link>
            {" · "}
            <Link href="/devis" className="underline">
              Devis
            </Link>
          </p>
          <h2 className="mt-1 font-serif text-3xl text-stone-900">{client.nom || "Fiche client"}</h2>
          <p className="text-sm text-stone-500">
            {TYPE_CLIENT_LABELS[client.type_client]}
            {client.pays ? ` · ${client.pays}` : ""} · Dossier OneDrive :{" "}
            {client.lien_dossier_onedrive || client.nom}
          </p>
        </div>
        <Link
          href={`/devis/nouveau?client=${encodeURIComponent(client.id)}`}
          className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-amber-50"
        >
          Nouveau devis
        </Link>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-950">Commentaires internes</p>
        <p className="mt-0.5 text-xs text-amber-900">
          Usage interne uniquement — ce texte n’apparaît jamais sur les devis ni les PDF envoyés au client.
        </p>
        <textarea
          className={`${FIELD} mt-2 border-amber-300 bg-white`}
          rows={4}
          placeholder="Notes pour l’équipe…"
          value={client.notes ?? ""}
          onChange={(e) => setField("notes", e.target.value || null)}
        />
      </div>

      <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
        <label className="text-sm">
          Nom
          <input className={`${FIELD} mt-1`} value={client.nom} onChange={(e) => setField("nom", e.target.value)} />
        </label>
        <label className="text-sm">
          E-mail
          <input
            className={`${FIELD} mt-1`}
            value={client.email ?? ""}
            onChange={(e) => setField("email", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Téléphone
          <input
            className={`${FIELD} mt-1`}
            value={client.telephone ?? ""}
            onChange={(e) => setField("telephone", e.target.value || null)}
          />
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1">Particulier ou professionnel</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {TYPES_CLIENT.map((type) => (
              <label key={type} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="type_client"
                  checked={client.type_client === type}
                  onChange={() => {
                    dirty.current.add("type_client");
                    setClient((cur) =>
                      cur
                        ? {
                            ...cur,
                            type_client: type,
                            siren_siret: type === "professionnel" ? cur.siren_siret : null,
                          }
                        : cur,
                    );
                    live.schedule({
                      type_client: type,
                      ...(type === "particulier" ? { siren_siret: null } : {}),
                    });
                  }}
                />
                {TYPE_CLIENT_LABELS[type as TypeClient]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="text-sm md:col-span-2">
          Adresse
          <input
            className={`${FIELD} mt-1`}
            value={client.adresse ?? ""}
            onChange={(e) => setField("adresse", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Code postal
          <input
            className={`${FIELD} mt-1`}
            value={client.code_postal ?? ""}
            onChange={(e) => setField("code_postal", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Ville
          <input
            className={`${FIELD} mt-1`}
            value={client.ville ?? ""}
            onChange={(e) => setField("ville", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Pays
          <input
            className={`${FIELD} mt-1`}
            value={client.pays ?? ""}
            onChange={(e) => setField("pays", e.target.value || null)}
          />
        </label>
        <label className="text-sm">
          Adresse de livraison
          <input
            className={`${FIELD} mt-1`}
            value={client.adresse_livraison ?? ""}
            onChange={(e) => setField("adresse_livraison", e.target.value || null)}
          />
        </label>
        {client.type_client === "professionnel" ? (
          <>
            <label className="text-sm">
              SIRET
              <input
                className={`${FIELD} mt-1`}
                value={client.siren_siret ?? ""}
                onChange={(e) => setField("siren_siret", e.target.value || null)}
              />
            </label>
            <label className="text-sm">
              TVA intra
              <input
                className={`${FIELD} mt-1`}
                value={client.tva_intra ?? ""}
                onChange={(e) => setField("tva_intra", e.target.value || null)}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void live.flush()}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm"
        >
          Enregistrer
        </button>
        <button type="button" disabled={busy} onClick={() => void remove()} className="px-4 py-2 text-sm text-red-800">
          Supprimer
        </button>
      </div>

      <div>
        <h3 className="mb-2 font-serif text-xl">Devis</h3>
        {devis.length === 0 ? (
          <p className="text-sm text-stone-600">Aucun devis pour cette fiche.</p>
        ) : (
          <ul className="divide-y rounded-lg border border-stone-200 bg-white text-sm">
            {devis.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <Link href={`/devis/${row.id}`} className="underline">
                  n° {row.numero} — {row.objet || "sans objet"}
                </Link>
                <span className="text-stone-500">
                  {formatIsoFr(row.date_emission)} · {STATUT_DEVIS_LABELS[row.statut]} ·{" "}
                  {formatMontantFr(totauxDevis(row.lignes, row.opt_remise ? row.remise : null).ttc)} €
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
