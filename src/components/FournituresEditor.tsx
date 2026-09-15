"use client";

import {
  TYPE_FOURNITURE_LABELS,
  TYPES_FOURNITURE,
  emptyFournitureRow,
  type LigneFourniture,
  type TypeFourniture,
} from "@/lib/fournitures";

export function FournituresEditor({
  rows,
  onChange,
  disabled,
}: {
  rows: LigneFourniture[];
  onChange: (rows: LigneFourniture[]) => void;
  disabled?: boolean;
}) {
  function update(index: number, patch: Partial<LigneFourniture>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-stone-300 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-stone-100 text-left text-stone-700">
            <tr>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Désignation</th>
              <th className="px-2 py-1.5 font-medium">Qté</th>
              <th className="px-2 py-1.5 font-medium">Unité</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-stone-500">
                  Aucune ligne. Ajoutez les fournitures du plan.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-stone-200">
                  <td className="px-1 py-1">
                    <select
                      disabled={disabled}
                      value={row.type}
                      onChange={(event) =>
                        update(index, {
                          type: event.target.value as TypeFourniture,
                        })
                      }
                      className="w-full rounded border border-stone-300 bg-white px-1 py-1"
                    >
                      {TYPES_FOURNITURE.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_FOURNITURE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      value={row.designation}
                      onChange={(event) =>
                        update(index, { designation: event.target.value })
                      }
                      className="w-full min-w-[8rem] rounded border border-stone-300 px-1.5 py-1"
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
                        update(index, {
                          quantite: Number(event.target.value),
                        })
                      }
                      className="w-16 rounded border border-stone-300 px-1.5 py-1"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      disabled={disabled}
                      value={row.unite}
                      onChange={(event) =>
                        update(index, { unite: event.target.value })
                      }
                      placeholder="ml, pièce…"
                      className="w-20 rounded border border-stone-300 px-1.5 py-1"
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
        onClick={() => onChange([...rows, emptyFournitureRow()])}
        className="rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
      >
        Ajouter une ligne
      </button>
    </div>
  );
}
