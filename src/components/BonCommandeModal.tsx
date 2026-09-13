"use client";

import { useMemo, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
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
  const rows = useMemo(() => snapshot.sousTraitants ?? [], [snapshot.sousTraitants]);
  const [sousTraitantId, setSousTraitantId] = useState(
    chantier?.sous_traitant_id ?? "",
  );
  const [specialite, setSpecialite] = useState(() => {
    const saved = rows.find((row) => row.id === chantier?.sous_traitant_id);
    return saved?.specialite || "tout";
  });
  const [preview, setPreview] = useState<Preview | null>(null);
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
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/planning/bon-commande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chantierId,
          sousTraitantId,
          confirm: false,
        }),
      });
      const data = (await res.json()) as Preview & { error?: string };
      if (!res.ok) throw new Error(data.error || "Aperçu impossible.");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aperçu impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!sousTraitantId || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/planning/bon-commande", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chantierId,
          sousTraitantId,
          confirm: true,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        onedriveWarning?: string;
      };
      if (!res.ok) throw new Error(data.error || "Envoi impossible.");
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
              Choisissez le sous-traitant, vérifiez l’aperçu, puis confirmez
              l’envoi. Rien ne part sans cette confirmation.
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
            {error ? (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            ) : null}
            {preview ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-stone-800">
                  Aperçu — {preview.subject}
                </p>
                <iframe
                  title="Aperçu du bon de commande"
                  className="h-[28rem] w-full rounded border border-stone-300"
                  src={`data:application/pdf;base64,${preview.pdfBase64}`}
                />
                <p className="text-xs text-stone-500">
                  Fichier : {preview.fileName}
                </p>
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
