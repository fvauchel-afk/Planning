"use client";

import { useState } from "react";
import { ConflictModal } from "@/components/ConflictModal";
import { PropositionSolutions } from "@/components/PropositionSolutions";
import { PHASE_LABELS, SENS_LABELS, SIGNALEMENT_LABELS } from "@/lib/types";
import { planDelayCascade, type DelayPlanResult } from "@/lib/engine/delay";
import { allSolutionsOf } from "@/lib/engine/plan-solutions";
import { formatLongDate } from "@/lib/dates";
import {
  isAdministratifIdleSuggestion,
  propositionFromDelay,
} from "@/lib/signalements";
import { usePlanning } from "@/lib/planning-context";
import type { PlanningSolution } from "@/lib/types";

export function SignalementsPage() {
  const { snapshot, validateSignalement, setSignalementStatut } = usePlanning();
  const [pending, setPending] = useState<{
    id: string;
    result: DelayPlanResult;
  } | null>(null);
  const [chosen, setChosen] = useState<Record<string, PlanningSolution>>({});
  const pendingItems = (snapshot.signalements ?? []).filter(
    (item) => item.statut === "en_attente",
  );
  const done = (snapshot.signalements ?? []).filter(
    (item) => item.statut !== "en_attente",
  );

  function describe(phaseId: string | null) {
    const phase = snapshot.phases.find((item) => item.id === phaseId);
    const element = snapshot.elements.find((item) => item.id === phase?.element_id);
    const chantier = snapshot.chantiers.find(
      (item) => item.id === element?.chantier_id,
    );
    const employee = snapshot.employees.find(
      (item) => item.id === phase?.employe_id,
    );
    return {
      phase,
      element,
      chantier,
      employee,
    };
  }

  async function validate(
    id: string,
    phaseId: string | null,
    halfDays: number,
    stored = pendingItems.find((item) => item.id === id)?.proposition,
  ) {
    const selected =
      chosen[id] ?? (stored ? allSolutionsOf(stored)[0] : undefined);
    if (selected?.patches.length || selected?.createChantier || stored?.patches.length || stored?.createChantier) {
      await validateSignalement(
        id,
        selected?.patches ?? stored?.patches ?? [],
        selected ? selected.createChantier ?? null : stored?.createChantier,
      );
      return;
    }
    if (!phaseId) {
      await validateSignalement(id, []);
      return;
    }
    const result = planDelayCascade(snapshot, phaseId, halfDays);
    if (result.status === "conflict") {
      setPending({ id, result });
      return;
    }
    await validateSignalement(id, result.patches);
  }

  return (
    <section className="space-y-6">
      {pending && (
        <ConflictModal
          title="Conflit de priorité"
          message={pending.result.message}
          displacements={pending.result.displacements}
          incoming={[]}
          showIncoming={false}
          validateLabel="Valider quand même"
          adjustLabel="Laisser en attente"
          onValidate={() => {
            const current = pending;
            setPending(null);
            void validateSignalement(current.id, current.result.patches);
          }}
          onAdjust={() => setPending(null)}
          onCancel={() => setPending(null)}
        />
      )}
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Signalements</h2>
        <p className="mt-1 text-sm text-stone-600">
          Validation par Michael ou Alexis. S’il y a plusieurs solutions, choisissez
          celle qui convient : vous voyez qui bouge, les dates, et un aperçu du
          planning. Rien n’est appliqué tant que vous n’avez pas validé. Le reste
          du planning reste utilisable en attendant.
        </p>
      </div>

      {pendingItems.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500">
          Aucun signalement en attente.
        </p>
      ) : (
        <div className="space-y-3">
          {pendingItems.map((item) => {
            const info = describe(item.phase_id);
            const auteur = snapshot.employees.find((e) => e.id === item.employe_id);
            const idle = isAdministratifIdleSuggestion(item);
            const signed =
              item.sens === "avance"
                ? -item.retard_demi_journees
                : item.retard_demi_journees;
            const preview =
              item.proposition ??
              (item.phase_id
                ? propositionFromDelay(
                    snapshot,
                    planDelayCascade(snapshot, item.phase_id, signed),
                  )
                : null);
            return (
              <article
                key={item.id}
                className="rounded-lg border border-stone-300 bg-white p-4"
              >
                <p className="font-medium">
                  {auteur?.nom}
                  {idle
                    ? " — Suggestion : bloc Administratif"
                    : item.proposition?.createChantier
                    ? ` — Nouveau chantier « ${item.proposition.createChantier.nom_client} »`
                    : ` — ${info.chantier?.nom_client ?? "Proposition"} / ${
                        info.element?.nom_element ?? "—"
                      } (${
                        info.phase ? PHASE_LABELS[info.phase.type_phase] : "phase"
                      })`}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  {idle
                    ? "Aucun chantier sur les 7 prochains jours. Validez pour l’ajouter au planning, ou rejetez."
                    : item.proposition
                    ? "Proposition de l’algorithme"
                    : `${SENS_LABELS[item.sens ?? "retard"]} : ${item.retard_demi_journees} demi-journée${
                        item.retard_demi_journees > 1 ? "s" : ""
                      }`}
                  {info.phase?.date_debut
                    ? ` · prévu ${formatLongDate(info.phase.date_debut)} → ${formatLongDate(info.phase.date_fin ?? info.phase.date_debut)}`
                    : ""}
                </p>
                {item.note && (
                  <p className="mt-2 rounded bg-stone-50 px-3 py-2 text-sm text-stone-700">
                    {item.note}
                  </p>
                )}
                {preview ? (
                  <PropositionSolutions
                    snapshot={snapshot}
                    proposition={preview}
                    onChange={(solution) =>
                      setChosen((current) => ({ ...current, [item.id]: solution }))
                    }
                  />
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50"
                    onClick={() =>
                      void validate(item.id, item.phase_id, signed, item.proposition)
                    }
                  >
                    {idle
                      ? "Valider le bloc Administratif"
                      : item.proposition
                      ? "Valider la solution choisie"
                      : item.sens === "avance"
                        ? "Valider et avancer"
                        : "Valider et décaler"}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-stone-300 px-3 py-2 text-sm"
                    onClick={() => void setSignalementStatut(item.id, "rejete")}
                  >
                    Rejeter
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <div>
          <h3 className="mb-2 font-medium text-stone-800">Historique</h3>
          <ul className="space-y-1 text-sm text-stone-600">
            {done.map((item) => {
              const auteur = snapshot.employees.find(
                (employee) => employee.id === item.employe_id,
              );
              return (
                <li key={item.id}>
                  {SIGNALEMENT_LABELS[item.statut]} —{" "}
                  {item.proposition
                    ? "Proposition algorithme"
                    : item.origine === "decalage_admin"
                      ? "Décalage admin"
                      : SENS_LABELS[item.sens ?? "retard"]}{" "}
                  — {auteur?.nom} ({item.retard_demi_journees} ½ j.)
                  {item.note ? ` · ${item.note}` : ""}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
