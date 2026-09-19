"use client";

import { useState } from "react";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { usePlanning } from "@/lib/planning-context";
import { formatSaveError } from "@/lib/supabase/errors";

export function AccesDroitsSettings() {
  const { snapshot, patchEmployee } = usePlanning();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = [...snapshot.employees].sort(compareEmployeesByOrdre);

  async function toggleAdmin(id: string, value: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await patchEmployee({ id, is_admin: value });
    } catch (err) {
      setError(formatSaveError(err, "le changement de droits a échoué"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-serif text-xl text-stone-900">Accès et droits</h3>
        <p className="mt-1 text-sm text-stone-600">
          Admin : tout le planning. Salarié : seulement Mon planning. PIN et horaires se
          règlent dans Employés.
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-100 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Droits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((employee) => (
              <tr key={employee.id} className="border-t border-stone-200">
                <td className="px-3 py-2">{employee.nom}</td>
                <td className="px-3 py-2">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={busyId === employee.id}
                      checked={Boolean(employee.is_admin)}
                      onChange={(e) => void toggleAdmin(employee.id, e.target.checked)}
                    />
                    {employee.is_admin ? "Admin" : "Salarié"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
