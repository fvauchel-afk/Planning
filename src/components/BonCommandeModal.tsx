"use client";

import { useMemo, useState } from "react";
import { BonCommandeLignesEditor } from "@/components/BonCommandeLignesEditor";
import { FormNotice } from "@/components/FormNotice";
import { PhotoPicker } from "@/components/PhotoPicker";
import { PdfPreview } from "@/components/PdfPreview";
import {
  defaultLignesBonCommande,
  normalizeLignesBonCommande,
  type LigneBonCommande,
} from "@/lib/bon-commande/lignes";
import { usePlanning } from "@/lib/planning-context";
import { planningApiPost } from "@/lib/planning/api";
import type { SousTraitant } from "@/lib/types";

type Preview = {
  fileName: string;
  pdfBase64: string;
  to: string;
  cc: string;
  subject: string;
  text: string;
  dateDocument: string;
};

export function BonCommandeModal({
  chantierId,
  onClose,
}: {
  chantierId: string;
  onClose: () => void;
}) {
  const { snapshot, refresh } = usePlanning();
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  const elements = useMemo(
    () => snapshot.elements.filter((item) => item.chantier_id === chantierId),
    [snapshot.elements, chantierId],
  );
  const rows = useMemo(() => snapshot.sousTraitants ?? [], [snapshot.sousTraitants]);
  const [sousTraitantId, setSousTraitantId] = useState(
    chantier?.sous_traitant_id ?? "",
  );
  const [lignes, setLignes] = useState<LigneBonCommande[]>(() => {
    if (chantier?.lignes_bon_commande?.length) {
      return chantier.lignes_bon_commande;
    }
    return defaultLignesBonCommande(elements);
  });
  const [specialite, setSpecialite] = useState(() => {
    const saved = rows.find((row) => row.id === chantier?.sous_traitant_id);
    return saved?.specialite || "tout";
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const specialites = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.specialite).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, "fr"),
    );
  }, [rows]);
  const filtered = rows.filter(
    (row) => specialite === "tout" || row.specialite === specialite,
  );
  const selected: SousTraitant | undefined = rows.find(
    (row) => row.id === sousTraitantId,
  );

  async function makePreview() {
    if (!sousTraitantId) {
      setError("Choisissez un sous-traitant.");
      return;
    }
    const pieces = normalizeLignesBonCommande(lignes);
    if (!pieces.length) {
      setError("Ajoutez au moins une pièce (quantité et descriptif).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await planningApiPost<Preview>("/api/planning/bon-commande", {
        chantierId,
        sousTraitantId,
        lignes: pieces,
        photos,
        confirm: false,
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aperçu impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sousTraitantId || !preview) return;
    const pieces = normalizeLignesBonCommande(lignes);
    if (!pieces.length) {
      setError("Ajoutez au moins une pièce (quantité et descriptif).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await planningApiPost<{
        error?: string;
        onedriveWarning?: string;
      }>("/api/planning/bon-commande", {
        chantierId,
        sousTraitantId,
        lignes: pieces,
        photos,
        confirm: true,
      });
      await refresh();
      setDone(
        data.onedriveWarning
          ? `Envoyé. Copie OneDrive : ${data.onedriveWarning}`
          : "Bon de commande envoyé, copié dans OneDrive, délai de 5 jours ouvrés calé.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <h3 className="font-serif text-xl text-stone-900">
          Bon de commande
        </h3>
        {done ? (
          <>
            <p className="mt-3 text-sm text-emerald-800">{done}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
              onClick={onClose}
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-600">
              Renseignez les pièces (quantité et descriptif), joignez des photos
              si besoin, choisissez le sous-traitant, vérifiez l’aperçu, puis
              confirmez l’envoi. Rien ne part sans cette confirmation.
            </p>
            {rows.length === 0 ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Aucun sous-traitant. Ajoutez-les dans l’onglet Sous-traitants.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Spécialité</span>
                  <select
                    value={specialite}
                    onChange={(event) => {
                      setSpecialite(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded border border-stone-300 px-3 py-2"
                  >
                    <option value="tout">Toutes</option>
                    {specialites.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Sous-traitant</span>
                  <select
                    value={sousTraitantId}
                    onChange={(event) => {
                      setSousTraitantId(event.target.value);
                      setPreview(null);
                    }}
                    className="w-full rounded border border-stone-300 px-3 py-2"
                  >
                    <option value="">Choisir…</option>
                    {filtered.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.nom} — {row.specialite}
                      </option>
                    ))}
                  </select>
                </label>
                {selected ? (
                  <p className="text-xs text-stone-500">
                    Destinataire : {selected.email} · Copie : f.vauchel@hotmail.com
                  </p>
                ) : null}
              </div>
            )}
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium">Pièces</p>
              <BonCommandeLignesEditor
                rows={lignes}
                disabled={busy}
                onChange={(next) => {
                  setLignes(next);
                  setPreview(null);
                }}
              />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium">Photos (optionnel)</p>
              <PhotoPicker
                photos={photos}
                disabled={busy}
                help="Joindre des photos pour le sous-traitant (appareil ou galerie)."
                onChange={(next) => {
                  setPhotos(next);
                  setPreview(null);
                }}
              />
            </div>
            {error ? <FormNotice className="mt-3">{error}</FormNotice> : null}
            {preview ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-stone-800">
                  Aperçu — {preview.subject}
                </p>
                <PdfPreview
                  title="Aperçu du bon de commande"
                  fileName={preview.fileName}
                  pdfBase64={preview.pdfBase64}
                />
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {!preview ? (
                <button
                  type="button"
                  disabled={busy || !sousTraitantId}
                  onClick={() => void makePreview()}
                  className="rounded-lg bg-amber-800 px-4 py-2 text-sm text-amber-50 disabled:opacity-60"
                >
                  {busy ? "Préparation…" : "Aperçu"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send()}
                  className="rounded-lg bg-amber-800 px-4 py-2 text-sm text-amber-50 disabled:opacity-60"
                >
                  {busy ? "Envoi…" : "Confirmer et envoyer"}
                </button>
              )}
              {preview ? (
                <button
                  type="button"
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                  onClick={() => setPreview(null)}
                  disabled={busy}
                >
                  Modifier
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-stone-600"
                onClick={onClose}
              >
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
