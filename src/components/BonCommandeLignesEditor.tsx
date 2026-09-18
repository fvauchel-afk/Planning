"use client";

import {
  emptyLigneBonCommande,
  type LigneBonCommande,
} from "@/lib/bon-commande/lignes";

export function BonCommandeLignesEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: LigneBonCommande[];
  onChange: (rows: LigneBonCommande[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<LigneBonCommande>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-stone-300 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="w-20 px-2 py-1.5 font-medium">Qté</th>
              <th className="px-2 py-1.5 font-medium">Descriptif de la pièce</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-2 py-3 text-stone-500">
                  Aucune ligne. Ajoutez les pièces du bon de commande.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-stone-200">
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step="any"
                      value={Number.isFinite(row.quantite) ? row.quantite : 0}
                      onChange={(event) =>
                        update(index, {
                          quantite: Number(event.target.value),
                        })
                      }
                      className="w-20 rounded border border-stone-300 px-1.5 py-1"
                      aria-label={`Quantité ligne ${index + 1}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      value={row.descriptif}
                      onChange={(event) =>
                        update(index, { descriptif: event.target.value })
                      }
                      placeholder="Ex. portail 2 vantaux, grille…"
                      className="w-full min-w-[10rem] rounded border border-stone-300 px-1.5 py-1"
                      aria-label={`Descriptif ligne ${index + 1}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onChange(rows.filter((_, i) => i !== index))
                      }
                      className="rounded px-1.5 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
                      aria-label="Supprimer la ligne"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, emptyLigneBonCommande()])}
        className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
      >
        Ajouter une ligne
      </button>
    </div>
  );
}
