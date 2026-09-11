"use client";

import { useEffect, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import {
  PRIORITES,
  PRIORITE_LABELS,
  type Chantier,
  type Priorite,
} from "@/lib/types";

export function ChantierEditModal({
  chantier,
  onClose,
}: {
  chantier: Chantier;
  onClose: () => void;
}) {
  const { updateChantier } = usePlanning();
  const [nomClient, setNomClient] = useState(chantier.nom_client);
  const [adresse, setAdresse] = useState(chantier.adresse);
  const [lien, setLien] = useState(chantier.lien_dossier_onedrive ?? "");
  const [priorite, setPriorite] = useState<Priorite>(chantier.priorite);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNomClient(chantier.nom_client);
    setAdresse(chantier.adresse);
    setLien(chantier.lien_dossier_onedrive ?? "");
    setPriorite(chantier.priorite);
    setError(null);
  }, [chantier]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nomClient.trim()) {
      setError("Le nom du client est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateChantier({
        id: chantier.id,
        nom_client: nomClient.trim(),
        adresse: adresse.trim(),
        priorite,
        lien_dossier_onedrive: lien.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
      >
        <h3 className="font-serif text-xl text-stone-900">Modifier le chantier</h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block">Nom</span>
            <input
              value={nomClient}
              onChange={(event) => setNomClient(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Adresse</span>
            <input
              value={adresse}
              onChange={(event) => setAdresse(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Priorité</span>
            <select
              value={priorite}
              onChange={(event) => setPriorite(event.target.value as Priorite)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            >
              {PRIORITES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Lien dossier OneDrive</span>
            <input
              value={lien}
              onChange={(event) => setLien(event.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-stone-300 px-3 py-2 text-sm"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}
