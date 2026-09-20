"use client";

import { useState } from "react";
import { canManageAdministratifIdle } from "@/lib/auth/administratif-idle-access";
import { administratifIdlePlans } from "@/lib/engine/administratif-idle";
import { formatIsoFr } from "@/lib/dates";
import { usePlanning } from "@/lib/planning-context";
import { useSession } from "@/lib/auth/session-context";

export function AdministratifIdleAlert() {
  const { session } = useSession();
  const { snapshot, applyAdministratifIdle } = usePlanning();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManageAdministratifIdle(session?.nom)) return null;
  const plans = administratifIdlePlans(snapshot);
  if (plans.length === 0) return null;

  async function run(employeeId: string, decision: "create" | "dismiss") {
    setBusyId(`${employeeId}:${decision}`);
    setError(null);
    try {
      await applyAdministratifIdle(employeeId, decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p className="font-medium">
        {plans.length === 1
          ? `${plans[0]?.employeeNom} n’a aucun chantier sur les 7 prochains jours.`
          : `${plans.length} salariés sans chantier sur les 7 prochains jours.`}
      </p>
      <p className="mt-1 text-xs">
        Uniquement pour un salarié qui a le rôle Administratif. Rien n’est
        ajouté tout seul : validez seulement si c’est pertinent.
      </p>
      <ul className="mt-3 space-y-2">
        {plans.map((plan) => (
          <li
            key={plan.employeeId}
            className="rounded border border-sky-200 bg-white px-3 py-2"
          >
            <p className="font-medium">{plan.employeeNom}</p>
            <p className="text-xs text-sky-800">
              Jours libres : {plan.freeDays.map(formatIsoFr).join(", ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busyId)}
                className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                onClick={() => void run(plan.employeeId, "create")}
              >
                {busyId === `${plan.employeeId}:create`
                  ? "Création…"
                  : `Créer un chantier Administratif pour ${plan.employeeNom}`}
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs disabled:opacity-60"
                onClick={() => void run(plan.employeeId, "dismiss")}
              >
                {busyId === `${plan.employeeId}:dismiss`
                  ? "…"
                  : "Ne pas proposer aujourd’hui"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
