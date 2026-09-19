"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevisLignesEditor } from "@/components/DevisLignesEditor";
import { PdfPreview } from "@/components/PdfPreview";
import { parisCalendarYmd } from "@/lib/dates";
import { devisApi } from "@/lib/devis/client-api";
import { emptyLigneDevis, formatMontantFr, totauxDevis, type LigneDevis } from "@/lib/devis/lignes";
import {
  STATUT_DEVIS_LABELS,
  type ClientFiche,
  type Devis,
  type StatutDevis,
} from "@/lib/devis/types";
import { useDebouncedPatch } from "@/lib/form-live";
import { usePlanning } from "@/lib/planning-context";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

type Preview = {
  fileName: string;
  pdfBase64: string;
  to: string;
  cc: string;
  subject: string;
  text: string;
};

export function DevisEditor({ devisId }: { devisId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { snapshot } = usePlanning();
  const [clients, setClients] = useState<ClientFiche[]>([]);
  const [devis, setDevis] = useState<Devis | null>(null);
  const [clientId, setClientId] = useState("");
  const [objet, setObjet] = useState("");
  const [dateDevis, setDateDevis] = useState(parisCalendarYmd());
  const [validite, setValidite] = useState(30);
  const [tva, setTva] = useState(20);
  const [notes, setNotes] = useState("");
  const [statut, setStatut] = useState<StatutDevis>("brouillon");
  const [chantierId, setChantierId] = useState("");
  const [lignes, setLignes] = useState<LigneDevis[]>([emptyLigneDevis()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [envoiTo, setEnvoiTo] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const dirty = useRef(new Set<string>());

  const loadClients = useCallback(async () => {
    const data = await devisApi<{ rows: ClientFiche[] }>("/api/clients");
    setClients(data.rows ?? []);
  }, []);

  const loadDevis = useCallback(async (id: string) => {
    const data = await devisApi<{ devis: Devis; client: ClientFiche | null }>(
      `/api/devis?id=${encodeURIComponent(id)}`,
    );
    setDevis(data.devis);
    if (!dirty.current.has("client_id")) setClientId(data.devis.client_id);
    if (!dirty.current.has("objet")) setObjet(data.devis.objet);
    if (!dirty.current.has("date_devis")) setDateDevis(data.devis.date_devis);
    if (!dirty.current.has("validite_jours")) setValidite(data.devis.validite_jours);
    if (!dirty.current.has("tva_pct")) setTva(data.devis.tva_pct);
    if (!dirty.current.has("notes")) setNotes(data.devis.notes ?? "");
    if (!dirty.current.has("statut")) setStatut(data.devis.statut);
    if (!dirty.current.has("chantier_id")) setChantierId(data.devis.chantier_id ?? "");
    if (!dirty.current.has("lignes")) {
      setLignes(data.devis.lignes.length ? data.devis.lignes : [emptyLigneDevis()]);
    }
    if (data.client?.email) setEnvoiTo((current) => current || data.client!.email!);
  }, []);

  useEffect(() => {
    void loadClients().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Lecture clients impossible.");
    });
  }, [loadClients]);

  useEffect(() => {
    if (devisId) return;
    const preset = searchParams.get("client")?.trim();
    if (preset) setClientId(preset);
  }, [devisId, searchParams]);

  useEffect(() => {
    if (!devisId) return;
    void loadDevis(devisId).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Lecture devis impossible.");
    });
  }, [devisId, loadDevis]);

  const applyPatch = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!devisId) return;
      await devisApi("/api/devis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: devisId, ...payload }),
      });
      Object.keys(payload).forEach((key) => dirty.current.delete(key));
      setPreview(null);
    },
    [devisId],
  );
  const live = useDebouncedPatch(applyPatch);

  function mark<K extends string>(key: K, value: unknown) {
    dirty.current.add(key);
    if (!devisId) return;
    live.schedule({ [key]: value });
  }

  const totaux = useMemo(() => totauxDevis(lignes, tva), [lignes, tva]);
  const client = clients.find((row) => row.id === clientId);

  async function create() {
    if (!clientId) {
      setError("Choisissez un client, ou créez d’abord une fiche.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await devisApi<{ id: string }>("/api/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          objet,
          date_devis: dateDevis,
          validite_jours: validite,
          tva_pct: tva,
          notes,
          lignes,
          chantier_id: chantierId || null,
        }),
      });
      router.replace(`/devis/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNow() {
    if (!devisId) {
      await create();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await live.flush();
      await loadDevis(devisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function makePreview() {
    if (!devisId) {
      setError("Enregistrez le devis avant l’aperçu PDF.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await live.flush();
      const data = await devisApi<Preview>("/api/devis/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: devisId }),
      });
      setPreview(data);
      if (data.to) setEnvoiTo(data.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aperçu impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!devisId || !preview) return;
    if (!window.confirm("Envoyer ce devis par e-mail au client ? Rien ne part sans confirmation.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await devisApi<{ to: string; cc: string }>("/api/devis/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: devisId, to: envoiTo }),
      });
      setDone(`Devis envoyé à ${data.to} (copie ${data.cc}).`);
      dirty.current.clear();
      await loadDevis(devisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!devisId) return;
    if (!window.confirm("Supprimer ce brouillon ?")) return;
    setBusy(true);
    try {
      await devisApi("/api/devis", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: devisId }),
      });
      router.replace("/devis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="space-y-4">
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {done}
        </p>
        <Link href="/devis" className="inline-block rounded-lg bg-stone-900 px-4 py-2 text-sm text-white">
          Retour aux devis
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm">
          <Link href="/devis" className="underline">
            Devis
          </Link>
          {clientId ? (
            <>
              {" · "}
              <Link href={`/devis/clients/${clientId}`} className="underline">
                Fiche client
              </Link>
            </>
          ) : null}
        </p>
        <h2 className="mt-1 font-serif text-3xl text-stone-900">
          {devis ? `Devis ${devis.numero}` : "Nouveau devis"}
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Les champs s’enregistrent tout seuls une fois le devis créé. Aperçu PDF, puis envoi
          confirmé au client.
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Client</span>
          <div className="flex flex-wrap gap-2">
            <select
              className={`${FIELD} flex-1`}
              value={clientId}
              onChange={(event) => {
                setClientId(event.target.value);
                mark("client_id", event.target.value);
              }}
            >
              <option value="">Choisir…</option>
              {clients.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nom}
                  {row.ville ? ` — ${row.ville}` : ""}
                </option>
              ))}
            </select>
            <Link
              href="/devis/clients"
              className="rounded-md border border-stone-300 px-3 py-2 text-sm"
            >
              Nouvelle fiche
            </Link>
          </div>
          {client && !client.email ? (
            <span className="mt-1 block text-xs text-amber-800">
              Pas d’e-mail sur la fiche : vous pourrez en saisir un à l’envoi.
            </span>
          ) : null}
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Objet</span>
          <input
            className={FIELD}
            value={objet}
            onChange={(event) => {
              setObjet(event.target.value);
              mark("objet", event.target.value);
            }}
            placeholder="Ex. Portail coulissant LEO, 4 m"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Date</span>
          <input
            type="date"
            className={FIELD}
            value={dateDevis}
            onChange={(event) => {
              setDateDevis(event.target.value);
              mark("date_devis", event.target.value);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Validité (jours)</span>
          <input
            type="number"
            min={1}
            max={180}
            className={FIELD}
            value={validite}
            onChange={(event) => {
              const n = Number(event.target.value);
              setValidite(n);
              mark("validite_jours", n);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">TVA %</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            className={FIELD}
            value={tva}
            onChange={(event) => {
              const n = Number(event.target.value);
              setTva(n);
              mark("tva_pct", n);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Statut</span>
          <select
            className={FIELD}
            value={statut}
            disabled={!devisId}
            onChange={(event) => {
              const next = event.target.value as StatutDevis;
              setStatut(next);
              mark("statut", next);
            }}
          >
            {Object.entries(STATUT_DEVIS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Chantier lié (optionnel)</span>
          <select
            className={FIELD}
            value={chantierId}
            onChange={(event) => {
              setChantierId(event.target.value);
              mark("chantier_id", event.target.value || null);
            }}
          >
            <option value="">Aucun</option>
            {snapshot.chantiers.map((chantier) => (
              <option key={chantier.id} value={chantier.id}>
                {chantier.nom_client} — {chantier.adresse}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Notes (bas de devis)</span>
          <textarea
            className={`${FIELD} min-h-[4.5rem]`}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              mark("notes", event.target.value);
            }}
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 font-serif text-xl text-stone-900">Lignes</h3>
        <DevisLignesEditor
          rows={lignes}
          onChange={(next) => {
            setLignes(next);
            mark("lignes", next);
            setPreview(null);
          }}
        />
        <p className="mt-3 text-sm text-stone-800">
          HT {formatMontantFr(totaux.ht)} € · TVA {formatMontantFr(totaux.tva)} € ·{" "}
          <strong>TTC {formatMontantFr(totaux.ttc)} €</strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!devisId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-50"
          >
            Créer le devis
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveNow()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
        )}
        <button
          type="button"
          disabled={busy || !devisId}
          onClick={() => void makePreview()}
          className="rounded-lg bg-sky-800 px-4 py-2 text-sm text-sky-50 disabled:opacity-50"
        >
          Aperçu PDF
        </button>
        {devis?.statut === "brouillon" && devisId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-lg px-4 py-2 text-sm text-red-800"
          >
            Supprimer
          </button>
        ) : null}
      </div>

      {preview ? (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <PdfPreview
            pdfBase64={preview.pdfBase64}
            fileName={preview.fileName}
            title={`Aperçu ${preview.fileName}`}
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Destinataire</span>
            <input
              className={FIELD}
              value={envoiTo}
              onChange={(event) => setEnvoiTo(event.target.value)}
            />
          </label>
          <p className="text-xs text-stone-500">
            Objet : {preview.subject} · Copie : {preview.cc}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-50"
          >
            Envoyer le devis
          </button>
        </div>
      ) : null}
    </section>
  );
}
