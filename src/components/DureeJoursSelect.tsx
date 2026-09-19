"use client";

import {
  dureeJoursMenuValues,
  formatDureeJoursLabel,
  normalizeDureeJours,
} from "@/lib/dates";

export function DureeJoursSelect({
  value,
  onChange,
  className = "rounded border border-stone-300 bg-white px-2 py-1",
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (jours: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const jours = normalizeDureeJours(value);
  return (
    <select
      value={jours}
      aria-label={ariaLabel}
      onChange={(event) => onChange(Number(event.target.value) || 1)}
      className={className}
    >
      {dureeJoursMenuValues(jours).map((item) => (
        <option key={item} value={item}>
          {formatDureeJoursLabel(item)}
        </option>
      ))}
    </select>
  );
}
