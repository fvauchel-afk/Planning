"use client";

import { useState, type MouseEvent, type PointerEvent } from "react";
import { idsEqual } from "@/lib/auth/ids";
import { useSession } from "@/lib/auth/session-context";
import { phaseAwaitingChantierLance } from "@/lib/dates-estimatives";
import { usePlanning } from "@/lib/planning-context";

export function LaunchValidateButton({
  phaseId,
  compact,
}: {
  phaseId: string;
  compact?: boolean;
}) {
  const { snapshot, confirmPhaseDates } = usePlanning();
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phase = snapshot.phases.find((item) => item.id === phaseId);
  if (!phase || !phaseAwaitingChantierLance(phase)) return null;
  if (
    !session?.isAdmin &&
    !idsEqual(phase.employe_id, session?.employeeId)
  ) {
    return null;
  }

  function stopDrag(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
  }

  async function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      await confirmPhaseDates([phaseId]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={compact ? "mt-0.5 block" : "inline-flex flex-col gap-1"}>
      <button
        type="button"
        disabled={busy}
        className={
          compact
            ? "w-full rounded bg-orange-700 px-1 py-0.5 text-[10px] font-semibold leading-tight text-orange-50 disabled:opacity-60"
            : "rounded-lg bg-orange-700 px-4 py-2 text-sm text-orange-50 disabled:opacity-60"
        }
        onPointerDown={stopDrag}
        onPointerMove={stopDrag}
        onClick={(event) => void onClick(event)}
      >
        {busy ? "Validation…" : "Chantier lancé"}
      </button>
      {error ? (
        <span className="block text-[11px] text-red-800">{error}</span>
      ) : null}
    </span>
  );
}
