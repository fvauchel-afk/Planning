"use client";

import {
  emptyLigneDevis,
  formatMontantFr,
  ligneMontantHt,
  TAUX_TVA,
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
      <div className="overflow-x-auto rounded-lg border border-mds-line bg-white shadow-sm">
        <table className="min-w-full text-sm text-mds-ink">
          <thead className="bg-mds-blue text-left text-white">
            <tr>
              <th className="px-2 py-1.5 font-medium">Désignation</th>
              <th className="w-20 px-2 py-1.5 font-medium">Quantité</th>
              <th className="w-28 px-2 py-1.5 font-medium">Unité</th>
              <th className="w-28 px-2 py-1.5 font-medium">Prix unitaire</th>
              <th className="w-24 px-2 py-1.5 font-medium">TVA</th>
              <th className="w-28 px-2 py-1.5 font-medium">Montant HT</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-stone-500">
                  Aucune ligne.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-mds-line align-top">
                  <td className="px-1 py-1">
                    <textarea
                      disabled={disabled}
                      value={row.designation}
                      onChange={(event) =>
                        update(index, { designation: event.target.value })
                      }
                      rows={2}
                      className="w-full min-w-[12rem] rounded-md border border-mds-line px-1.5 py-1"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step="any"
                      value={row.quantite}
                      onChange={(event) =>
                        update(index, { quantite: Number(event.target.value) })
                      }
                      className="w-20 rounded-md border border-mds-line px-1.5 py-1"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      list={`unites-devis-${index}`}
                      value={row.unite}
                      onChange={(event) => update(index, { unite: event.target.value })}
                      className="w-28 rounded-md border border-mds-line px-1.5 py-1"
                    />
                    <datalist id={`unites-devis-${index}`}>
                      {UNITES_DEVIS.map((u) => (
                        <option key={u.v} value={u.v}>
                          {u.l}
                        </option>
                      ))}
                    </datalist>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.prix_unitaire_ht}
                      onChange={(event) =>
                        update(index, { prix_unitaire_ht: Number(event.target.value) })
                      }
                      className="w-28 rounded-md border border-mds-line px-1.5 py-1 text-right"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={row.tva_pct}
                      onChange={(event) =>
                        update(index, { tva_pct: Number(event.target.value) })
                      }
                      className="w-24 rounded-md border border-mds-line px-1.5 py-1"
                    >
                      {TAUX_TVA.map((taux) => (
                        <option key={taux} value={taux}>
                          {taux} %
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatMontantFr(ligneMontantHt(row))} €
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                      className="text-mds-steel hover:text-red-700"
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
        className="rounded-md border border-mds-line bg-white px-3 py-1.5 text-sm text-mds-ink hover:border-mds-blue"
      >
        + Ligne simple
      </button>
    </div>
  );
}
