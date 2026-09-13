"use client";

import type { SousTraitant } from "@/lib/types";

export function SousTraitantSelect({
  value,
  onChange,
  rows,
}: {
  value: string;
  onChange: (id: string) => void;
  rows: SousTraitant[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-stone-500">
        Aucun sous-traitant. Ajoutez-les dans l’onglet Sous-traitants, ou
        choisissez-le au moment d’envoyer le bon de commande.
      </p>
    );
  }
  return (
    <label className="block">
      <span className="mb-1 block font-medium">Sous-traitant</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border border-stone-300 bg-white px-3 py-2"
      >
        <option value="">À choisir à l’envoi du bon de commande</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.nom} — {row.specialite}
          </option>
        ))}
      </select>
    </label>
  );
}
