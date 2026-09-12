"use client";

import { useState } from "react";
import { formatLongDate } from "@/lib/dates";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { usePlanning } from "@/lib/planning-context";
import {
  ABSENCE_LABELS,
  TYPES_ABSENCE,
  absenceLabel,
  type Absence,
  type TypeAbsence,
} from "@/lib/types";

export function AbsencesPage() {
  const { snapshot, createAbsence, updateAbsence, deleteAbsence } = usePlanning();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [employeId, setEmployeId] = useState("");
  const [type, setType] = useState<TypeAbsence>("conge");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [motifPrecision, setMotifPrecision] = useState("");

  const employeesById = new Map(
    snapshot.employees.map((employee) => [employee.id, employee]),
  );

  function resetForm() {
    setEditingId(null);
    setEmployeId("");
    setType("conge");
    setDateDebut("");
    setDateFin("");
    setMotifPrecision("");
    setError(null);
  }

  function startEdit(absence: Absence) {
    setEditingId(absence.id);
    setEmployeId(absence.employe_id);
    setType(absence.type);
    setDateDebut(absence.date_debut.slice(0, 10));
    setDateFin(absence.date_fin.slice(0, 10));
    setMotifPrecision(absence.motif_precision ?? "");
    setError(null);
    window.requestAnimationFrame(() => {
      document.getElementById("absence-form")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!employeId || !dateDebut || !dateFin) {
      setError("Tous les champs sont obligatoires.");
      return;
    }
    if (dateFin < dateDebut) {
      setError("La date de fin doit être après la date de début.");
      return;
    }
    if (type === "autre" && !motifPrecision.trim()) {
      setError("Précisez le motif pour une absence de type « Autre ».");
      return;
    }
    setError(null);
    const payload = {
      employe_id: employeId,
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      motif_precision: type === "autre" ? motifPrecision.trim() : null,
    };
    if (editingId) {
      await updateAbsence({ id: editingId, ...payload });
    } else {
      await createAbsence(payload);
    }
    resetForm();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Absences</h2>
        <p className="mt-1 mb-4 text-sm text-stone-600">
          Congés, maladie, formation, jour férié d&apos;entreprise ou autre
          motif justifié.
        </p>
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Employé</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Début</th>
                <th className="px-3 py-2 font-medium">Fin</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {snapshot.absences.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-stone-500" colSpan={5}>
                    Aucune absence enregistrée.
                  </td>
                </tr>
              )}
              {snapshot.absences.map((absence) => (
                <tr
                  key={absence.id}
                  className={`border-t border-stone-200 ${
                    editingId === absence.id ? "bg-amber-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {employeesById.get(absence.employe_id)?.nom ?? "—"}
                  </td>
                  <td className="px-3 py-2">{absenceLabel(absence)}</td>
                  <td className="px-3 py-2">
                    {formatLongDate(absence.date_debut)}
                  </td>
                  <td className="px-3 py-2">{formatLongDate(absence.date_fin)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="mr-3 text-amber-800"
                      onClick={() => startEdit(absence)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className="text-red-700"
                      onClick={() => {
                        if (editingId === absence.id) resetForm();
                        void deleteAbsence(absence.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form
        id="absence-form"
        onSubmit={onSubmit}
        className="h-fit space-y-3 rounded-lg border border-stone-300 bg-white p-4"
      >
        <h3 className="font-medium">
          {editingId ? "Modifier l’absence" : "Ajouter une absence"}
        </h3>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <label className="block text-sm">
          <span className="mb-1 block">Employé</span>
          <select
            value={employeId}
            onChange={(event) => setEmployeId(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            <option value="">Choisir…</option>
            {snapshot.employees
              .filter((employee) => employee.actif || employee.id === employeId)
              .sort(compareEmployeesByOrdre)
              .map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nom}
                </option>
              ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TypeAbsence)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          >
            {TYPES_ABSENCE.map((value) => (
              <option key={value} value={value}>
                {ABSENCE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        {type === "autre" && (
          <label className="block text-sm">
            <span className="mb-1 block">Préciser le motif</span>
            <input
              value={motifPrecision}
              onChange={(event) => setMotifPrecision(event.target.value)}
              placeholder="Ex. rendez-vous administratif…"
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block">Début</span>
          <input
            type="date"
            value={dateDebut}
            onChange={(event) => setDateDebut(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fin</span>
          <input
            type="date"
            value={dateFin}
            onChange={(event) => setDateFin(event.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50"
          >
            {editingId ? "Enregistrer les modifications" : "Enregistrer"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded border border-stone-300 px-3 py-2 text-sm"
            >
              Annuler
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
