"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevisLignesEditor } from "@/components/DevisLignesEditor";
import { PdfPreview } from "@/components/PdfPreview";
import { ClientFormFields, EMPTY_CLIENT_CREATE } from "@/components/ClientFormFields";
import { devisApi } from "@/lib/devis/client-api";
import { emptyLigneDevis, formatMontantFr, totauxDevis, type LigneDevis, type RemiseDevis } from "@/lib/devis/lignes";
import { formatIsoFr } from "@/lib/dates";
import {
  STATUT_DEVIS_LABELS,
  TYPE_FACTURATION_LABELS,
  type ClientFiche,
  type Devis,
  type StatutDevis,
  type TypeFacturation,
} from "@/lib/devis/types";
import { useDebouncedPatch } from "@/lib/form-live";

const FIELD =
  "w-full rounded-md border border-mds-line bg-white px-3 py-2 text-sm text-mds-ink outline-none focus:border-mds-blue focus:ring-1 focus:ring-mds-blue";
const CARD =
  "rounded-lg border border-mds-line border-l-4 border-l-mds-blue bg-white p-4 shadow-sm";
const BTN_PRIMARY =
  "rounded-lg bg-mds-blue px-4 py-2 text-sm font-medium text-white hover:bg-mds-blue-dark disabled:opacity-60";
const BTN_SECONDARY =
  "rounded-lg border border-mds-line bg-white px-4 py-2 text-sm text-mds-ink hover:border-mds-blue disabled:opacity-60";

type Preview = { fileName: string; pdfBase64: string; to: string; subject: string; text: string };

export function DevisEditor({ devisId }: { devisId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientFiche[]>([]);
  const [devis, setDevis] = useState<Devis | null>(null);
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState(false);
  const [nc, setNc] = useState(EMPTY_CLIENT_CREATE);
  const [objet, setObjet] = useState("");
  const [validite, setValidite] = useState(5);
  const [statut, setStatut] = useState<StatutDevis>("brouillon");
  const [lignes, setLignes] = useState<LigneDevis[]>([emptyLigneDevis()]);
  const [typeFact, setTypeFact] = useState<TypeFacturation>("complet");
  const [optLiv, setOptLiv] = useState(false);
  const [optSiren, setOptSiren] = useState(false);
  const [optTva, setOptTva] = useState(false);
  const [optCond, setOptCond] = useState(true);
  const [optSign, setOptSign] = useState(true);
  const [optIntitule, setOptIntitule] = useState(false);
  const [optLibre, setOptLibre] = useState(false);
  const [optRemise, setOptRemise] = useState(false);
  const [intitule, setIntitule] = useState("");
  const [remiseType, setRemiseType] = useState<"pourcentage" | "montant">("pourcentage");
  const [remiseVal, setRemiseVal] = useState(0);
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

  const applyFromDevis = useCallback((d: Devis, client?: ClientFiche | null) => {
    setDevis(d);
    if (!dirty.current.has("client_id")) setClientId(d.client_id);
    if (!dirty.current.has("objet")) setObjet(d.objet);
    if (!dirty.current.has("validite_jours")) setValidite(d.validite_jours);
    if (!dirty.current.has("statut")) setStatut(d.statut);
    if (!dirty.current.has("lignes")) setLignes(d.lignes.length ? d.lignes : [emptyLigneDevis()]);
    if (!dirty.current.has("type_facturation")) setTypeFact(d.type_facturation);
    if (!dirty.current.has("opt_adresse_livraison")) setOptLiv(d.opt_adresse_livraison);
    if (!dirty.current.has("opt_siren")) setOptSiren(d.opt_siren);
    if (!dirty.current.has("opt_tva_intra")) setOptTva(d.opt_tva_intra);
    if (!dirty.current.has("opt_conditions")) setOptCond(d.opt_conditions);
    if (!dirty.current.has("opt_signature")) setOptSign(d.opt_signature);
    if (!dirty.current.has("opt_intitule")) setOptIntitule(d.opt_intitule);
    if (!dirty.current.has("opt_champ_libre")) setOptLibre(d.opt_champ_libre);
    if (!dirty.current.has("opt_remise")) setOptRemise(d.opt_remise);
    if (!dirty.current.has("intitule_document")) setIntitule(d.intitule_document ?? "");
    if (!dirty.current.has("remise")) {
      setRemiseType(d.remise?.type ?? "pourcentage");
      setRemiseVal(d.remise?.valeur ?? 0);
    }
    if (client?.email) setEnvoiTo((cur) => cur || client.email!);
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
    void devisApi<{ devis: Devis; client: ClientFiche | null }>(
      `/api/devis?id=${encodeURIComponent(devisId)}`,
    )
      .then((data) => applyFromDevis(data.devis, data.client))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lecture devis impossible.");
      });
  }, [devisId, applyFromDevis]);

  const applyPatch = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!devisId) return;
      await devisApi("/api/devis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: devisId, ...payload }),
      });
      Object.keys(payload).forEach((k) => dirty.current.delete(k));
      setPreview(null);
    },
    [devisId],
  );
  const live = useDebouncedPatch(applyPatch);

  function mark(key: string, value: unknown) {
    dirty.current.add(key);
    if (devisId) live.schedule({ [key]: value });
  }

  const remise: RemiseDevis = useMemo(
    () => (optRemise ? { type: remiseType, valeur: remiseVal } : null),
    [optRemise, remiseType, remiseVal],
  );
  const totaux = useMemo(() => totauxDevis(lignes, remise), [lignes, remise]);

  async function ensureClient(): Promise<string | null> {
    if (!newClient) return clientId || null;
    if (!nc.nom.trim()) {
      setError("Nom du nouveau client obligatoire.");
      return null;
    }
    const data = await devisApi<{ id: string }>("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nc),
    });
    await loadClients();
    setNewClient(false);
    setClientId(data.id);
    return data.id;
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const cid = await ensureClient();
      if (!cid) {
        setError("Choisissez ou créez un client.");
        return;
      }
      const data = await devisApi<{ id: string }>("/api/devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: cid,
          objet,
          validite_jours: validite,
          lignes,
          type_facturation: typeFact,
          opt_adresse_livraison: optLiv,
          opt_siren: optSiren,
          opt_tva_intra: optTva,
          opt_conditions: optCond,
          opt_signature: optSign,
          opt_intitule: optIntitule,
          opt_champ_libre: optLibre,
          opt_remise: optRemise,
          intitule_document: intitule,
          remise,
        }),
      });
      router.replace(`/devis/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function makePreview() {
    if (!devisId) {
      setError("Créez d’abord le devis.");
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
    if (!window.confirm("Envoyer ce devis par e-mail (Hotmail OneDrive) ?")) return;
    setBusy(true);
    setError(null);
    try {
      const data = await devisApi<{ to: string; onedriveWarning?: string | null }>(
        "/api/devis/envoyer",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: devisId, to: envoiTo }),
        },
      );
      setDone(
        data.onedriveWarning
          ? `Envoyé à ${data.to}. OneDrive : ${data.onedriveWarning}`
          : `Envoyé à ${data.to} et copié dans le dossier OneDrive du client.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!devisId || !window.confirm("Supprimer ce brouillon ? Le numéro ne sera pas réutilisé.")) return;
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
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">{done}</p>
        <Link href="/devis" className="inline-block rounded-lg bg-mds-blue px-4 py-2 text-sm font-medium text-white hover:bg-mds-blue-dark">
          Retour aux devis
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-5 text-mds-ink">
      <div>
        <p className="text-sm">
          <Link href="/devis" className="underline">Devis</Link>
          {clientId ? (
            <>
              {" · "}
              <Link href={`/devis/clients/${clientId}`} className="underline">Fiche client</Link>
            </>
          ) : null}
        </p>
        <h2 className="mt-1 font-serif text-3xl text-mds-ink">
          {devis ? `Devis n° ${devis.numero}` : "Nouveau devis"}
        </h2>
        {devis ? (
          <p className="text-sm text-stone-500">
            Émis le {formatIsoFr(devis.date_emission)} · validité {validite} jours
          </p>
        ) : (
          <p className="text-sm text-stone-500">La date d’émission est posée à la création, sans saisie.</p>
        )}
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className={`grid gap-3 md:grid-cols-2 ${CARD}`}>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Client</span>
          {newClient ? (
            <div className="grid gap-2 md:grid-cols-2">
              <ClientFormFields value={nc} onChange={setNc} fieldClass={FIELD} />
              <button type="button" className="text-sm underline" onClick={() => setNewClient(false)}>
                Choisir une fiche existante
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select
                className={`${FIELD} flex-1`}
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  mark("client_id", e.target.value);
                }}
              >
                <option value="">Choisir…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
              <button type="button" className="rounded-md border border-mds-line px-3 py-2 text-sm hover:border-mds-blue" onClick={() => setNewClient(true)}>
                Nouveau client
              </button>
            </div>
          )}
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Objet</span>
          <input className={FIELD} value={objet} onChange={(e) => { setObjet(e.target.value); mark("objet", e.target.value); }} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Validité (jours)</span>
          <input type="number" min={1} className={FIELD} value={validite} onChange={(e) => { const n = Number(e.target.value); setValidite(n); mark("validite_jours", n); }} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Statut</span>
          <select
            className={FIELD}
            value={statut}
            disabled={!devisId}
            onChange={(e) => {
              const v = e.target.value as StatutDevis;
              setStatut(v);
              mark("statut", v);
            }}
          >
            {Object.entries(STATUT_DEVIS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={CARD}>
        <h3 className="mb-2 font-serif text-lg text-mds-ink">Options</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-sm">
            Type de facturation
            <select className={`${FIELD} mt-1`} value={typeFact} onChange={(e) => { const v = e.target.value as TypeFacturation; setTypeFact(v); mark("type_facturation", v); }}>
              {Object.entries(TYPE_FACTURATION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <p className="text-sm text-stone-600 md:pt-6">Langue : Français</p>
        </div>
        <fieldset className="mt-3 text-sm">
          <legend className="font-medium">Client</legend>
          <label className="mr-3"><input type="checkbox" checked={optLiv} onChange={(e) => { setOptLiv(e.target.checked); mark("opt_adresse_livraison", e.target.checked); }} /> Adresse de livraison</label>
          <label className="mr-3"><input type="checkbox" checked={optSiren} onChange={(e) => { setOptSiren(e.target.checked); mark("opt_siren", e.target.checked); }} /> SIREN ou SIRET</label>
          <label><input type="checkbox" checked={optTva} onChange={(e) => { setOptTva(e.target.checked); mark("opt_tva_intra", e.target.checked); }} /> N° de TVA intra</label>
        </fieldset>
        <fieldset className="mt-3 text-sm">
          <legend className="font-medium">Info complémentaire</legend>
          <label className="mr-3"><input type="checkbox" checked={optCond} onChange={(e) => { setOptCond(e.target.checked); mark("opt_conditions", e.target.checked); }} /> Conditions d&apos;acceptation</label>
          <label className="mr-3"><input type="checkbox" checked={optSign} onChange={(e) => { setOptSign(e.target.checked); mark("opt_signature", e.target.checked); }} /> Champ signature</label>
          <label className="mr-3"><input type="checkbox" checked={optIntitule} onChange={(e) => { setOptIntitule(e.target.checked); mark("opt_intitule", e.target.checked); }} /> Intitulé du document</label>
          <label className="mr-3"><input type="checkbox" checked={optLibre} onChange={(e) => { setOptLibre(e.target.checked); mark("opt_champ_libre", e.target.checked); }} /> Champ libre</label>
          <label><input type="checkbox" checked={optRemise} onChange={(e) => { setOptRemise(e.target.checked); mark("opt_remise", e.target.checked); }} /> Remise globale</label>
        </fieldset>
        {optIntitule ? (
          <input className={`${FIELD} mt-2`} placeholder="Intitulé" value={intitule} onChange={(e) => { setIntitule(e.target.value); mark("intitule_document", e.target.value); }} />
        ) : null}
        {optRemise ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <select className={FIELD} value={remiseType} onChange={(e) => {
              const t = e.target.value as "pourcentage" | "montant";
              setRemiseType(t);
              mark("remise", { type: t, valeur: remiseVal });
            }}>
              <option value="pourcentage">Pourcentage</option>
              <option value="montant">Montant fixe HT</option>
            </select>
            <input type="number" min={0} step="0.01" className={FIELD} value={remiseVal} onChange={(e) => {
              const n = Number(e.target.value);
              setRemiseVal(n);
              mark("remise", { type: remiseType, valeur: n });
            }} />
          </div>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 font-serif text-xl text-mds-ink">Lignes</h3>
        <DevisLignesEditor
          rows={lignes}
          onChange={(next) => { setLignes(next); mark("lignes", next); }}
        />
        <p className="mt-3 rounded-lg border border-mds-line border-l-4 border-l-mds-blue bg-mds-mist px-4 py-3 text-sm text-mds-ink">
          Total HT {formatMontantFr(totaux.htBrut)} €
          {totaux.remise > 0 ? ` · Remise ${formatMontantFr(totaux.remise)} € · Net HT ${formatMontantFr(totaux.ht)} €` : ""}
          {totaux.parTaux.map((b) => (
            <span key={b.taux}> · TVA {b.taux}% {formatMontantFr(b.tva)} €</span>
          ))}
          {" · "}
          <strong>TTC {formatMontantFr(totaux.ttc)} €</strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {!devisId ? (
          <button type="button" disabled={busy} onClick={() => void create()} className={BTN_PRIMARY}>
            Créer le devis
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void live.flush()} className={BTN_SECONDARY}>
            Enregistrer
          </button>
        )}
        <button type="button" disabled={busy || !devisId} onClick={() => void makePreview()} className={BTN_SECONDARY}>
          Aperçu PDF
        </button>
        {devis?.statut === "brouillon" && devisId ? (
          <button type="button" disabled={busy} onClick={() => void remove()} className="px-4 py-2 text-sm text-red-800">
            Supprimer
          </button>
        ) : null}
      </div>

      {preview ? (
        <div className={`space-y-3 ${CARD}`}>
          <PdfPreview pdfBase64={preview.pdfBase64} fileName={preview.fileName} title="Aperçu devis" />
          <label className="block text-sm">
            Destinataire
            <input className={`${FIELD} mt-1`} value={envoiTo} onChange={(e) => setEnvoiTo(e.target.value)} />
          </label>
          <p className="text-xs text-stone-500">Objet : {preview.subject}</p>
          <button type="button" disabled={busy} onClick={() => void send()} className={BTN_PRIMARY}>
            Envoyer le devis
          </button>
        </div>
      ) : null}
    </section>
  );
}
