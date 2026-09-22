"use client";

import {
  CRENEAU_ABSENCE_LABELS,
  CRENEAUX_ABSENCE,
  type CreneauAbsence,
} from "@/lib/absence-creneau";

export function AbsenceCreneauFields({
  creneau,
  dureeHeures,
  onCreneau,
  onDureeHeures,
  hidden,
  name = "absence-creneau",
}: {
  creneau: CreneauAbsence;
  dureeHeures: string;
  onCreneau: (value: CreneauAbsence) => void;
  onDureeHeures: (value: string) => void;
  hidden?: boolean;
  name?: string;
}) {
  if (hidden) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 block text-sm text-stone-600">Créneau</legend>
      <div className="space-y-1.5">
        {CRENEAUX_ABSENCE.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={name}
              checked={creneau === value}
              onChange={() => onCreneau(value)}
            />
            <span>{CRENEAU_ABSENCE_LABELS[value]}</span>
          </label>
        ))}
      </div>
      {creneau === "heures" ? (
        <label className="block text-sm">
          <span className="mb-1 block text-stone-600">Nombre d’heures</span>
          <input
            type="number"
            min={0.5}
            max={12}
            step={0.5}
            value={dureeHeures}
            onChange={(event) => onDureeHeures(event.target.value)}
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
          />
          <span className="mt-1 block text-xs text-stone-500">
            Comptées depuis le début de matinée. Le reste de la journée reste
            travaillable.
          </span>
        </label>
      ) : (
        <p className="text-xs text-stone-500">
          Une fois validé, seuls ces créneaux sont bloqués sur le planning.
        </p>
      )}
    </fieldset>
  );
}
