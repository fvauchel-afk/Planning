"use client";

import {
  emptyLigneDevis,
  formatMontantFr,
  ligneMontantHt,
  UNITES_DEVIS,
  type LigneDevis,
} from "@/lib/devis/lignes";

export function DevisLignesEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: LigneDevis[];
  onChange: (rows: LigneDevis[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<LigneDevis>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-stone-300 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-2 py-1.5 font-medium">Désignation</th>
              <th className="w-20 px-2 py-1.5 font-medium">Qté</th>
              <th className="w-24 px-2 py-1.5 font-medium">Unité</th>
              <th className="w-28 px-2 py-1.5 font-medium">PU HT</th>
              <th className="w-28 px-2 py-1.5 font-medium">Total HT</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-stone-500">
                  Aucune ligne. Ajoutez les postes du devis.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-stone-200">
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      value={row.designation}
                      onChange={(event) =>
                        update(index, { designation: event.target.value })
                      }
                      placeholder="Ex. portail coulissant LEO 4000 × 1600"
                      className="w-full min-w-[12rem] rounded border border-stone-300 px-1.5 py-1"
                      aria-label={`Désignation ligne ${index + 1}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step="any"
                      value={Number.isFinite(row.quantite) ? row.quantite : 0}
                      onChange={(event) =>
                        update(index, { quantite: Number(event.target.value) })
                      }
                      className="w-20 rounded border border-stone-300 px-1.5 py-1"
                      aria-label={`Quantité ligne ${index + 1}`}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={row.unite}
                      onChange={(event) => update(index, { unite: event.target.value })}
                      className="w-24 rounded border border-stone-300 px-1.5 py-1"
                      aria-label={`Unité ligne ${index + 1}`}
                    >
                      {UNITES_DEVIS.map((unite) => (
                        <option key={unite} value={unite}>
                          {unite}
                        </option>
                      ))}
                      {(UNITES_DEVIS as readonly string[]).includes(row.unite) ? null : (
                        <option value={row.unite}>{row.unite}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step="0.01"
                      value={
                        Number.isFinite(row.prix_unitaire_ht) ? row.prix_unitaire_ht : 0
                      }
                      onChange={(event) =>
                        update(index, { prix_unitaire_ht: Number(event.target.value) })
                      }
                      className="w-28 rounded border border-stone-300 px-1.5 py-1 text-right"
                      aria-label={`Prix unitaire ligne ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-stone-700">
                    {formatMontantFr(ligneMontantHt(row))} €
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
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
        onClick={() => onChange([...rows, emptyLigneDevis()])}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400 disabled:opacity-50"
      >
        Ajouter une ligne
      </button>
    </div>
  );
}
