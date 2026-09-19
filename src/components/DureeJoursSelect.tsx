"use client";

import {
  dureeJoursMenuValues,
  formatDureeJoursLabel,
} from "@/lib/dates";
import {
  hoursFromDayPreset,
  matchingDureeJoursFromHours,
} from "@/lib/engine/duree-presets";
import type { PlanningSnapshot } from "@/lib/types";

export function DureeJoursSelect({
  value,
  onChange,
  allowEmpty = false,
  className = "rounded border border-stone-300 bg-white px-2 py-1",
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (jours: number) => void;
  allowEmpty?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const selected =
    value != null && Number.isFinite(value) ? String(value) : "";
  return (
    <select
      value={selected}
      aria-label={ariaLabel}
      onChange={(event) => {
        const raw = event.target.value;
        if (!raw) return;
        onChange(Number(raw));
      }}
      className={className}
    >
      {allowEmpty ? (
        <option value="">
          {selected ? "Jours…" : "Heures saisies"}
        </option>
      ) : null}
      {dureeJoursMenuValues(value).map((item) => (
        <option key={item} value={item}>
          {formatDureeJoursLabel(item)}
        </option>
      ))}
    </select>
  );
}

export function PhaseDureeFields({
  hours,
  snapshot,
  employeeId,
  onHoursChange,
  ariaLabel,
}: {
  hours: string;
  snapshot: PlanningSnapshot;
  employeeId: string | null | undefined;
  onHoursChange: (hours: string) => void;
  ariaLabel: string;
}) {
  const matched = matchingDureeJoursFromHours(
    snapshot,
    employeeId,
    Number(hours || 0),
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.5"
        value={hours}
        onChange={(event) => onHoursChange(event.target.value)}
        className="w-16 rounded border border-stone-300 bg-white px-2 py-1"
        aria-label={`${ariaLabel} (heures)`}
      />
      <span className="text-xs text-stone-500">h</span>
      <DureeJoursSelect
        value={matched}
        allowEmpty
        aria-label={`${ariaLabel} (jours)`}
        onChange={(jours) =>
          onHoursChange(String(hoursFromDayPreset(snapshot, employeeId, jours)))
        }
      />
    </div>
  );
}
