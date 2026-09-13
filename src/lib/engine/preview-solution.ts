import type {
  NewChantierInput,
  PhasePatch,
  PlanningSnapshot,
  PlanningSolution,
} from "@/lib/types";
import { PHASE_LABELS } from "@/lib/types";

export function applyPatchesPreview(
  snapshot: PlanningSnapshot,
  patches: PhasePatch[],
): PlanningSnapshot {
  if (!patches.length) return snapshot;
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return {
    ...snapshot,
    phases: snapshot.phases.map((phase) => {
      const patch = byId.get(phase.id);
      if (!patch) return phase;
      return {
        ...phase,
        date_debut: patch.date_debut,
        date_fin: patch.date_fin,
        employe_id: patch.employe_id,
        heure_debut:
          patch.heure_debut !== undefined ? patch.heure_debut : phase.heure_debut,
        duree_estimee_heures:
          patch.duree_estimee_heures ?? phase.duree_estimee_heures,
      };
    }),
  };
}

export function previewSolutionSnapshot(
  snapshot: PlanningSnapshot,
  solution: PlanningSolution,
): PlanningSnapshot {
  let next = applyPatchesPreview(snapshot, solution.patches);
  const input = solution.createChantier;
  if (!input) return next;
  const chantierId = "preview-chantier";
  next = {
    ...next,
    chantiers: [
      ...next.chantiers,
      {
        id: chantierId,
        nom_client: input.nom_client,
        adresse: input.adresse,
        lien_dossier_onedrive: input.lien_dossier_onedrive,
        priorite: input.priorite,
        tolerance_deplacement_jours: input.tolerance_deplacement_jours ?? null,
        date_creation: new Date().toISOString().slice(0, 10),
        dates_estimatives: Boolean(input.dates_estimatives),
        adresse_livraison: input.adresse_livraison ?? null,
        telephone_livraison: input.telephone_livraison ?? null,
      },
    ],
  };
  input.elements.forEach((element, elementIndex) => {
    const elementId = `preview-el-${elementIndex}`;
    next.elements = [
      ...next.elements,
      { id: elementId, chantier_id: chantierId, nom_element: element.nom_element },
    ];
    element.phases.forEach((phase, phaseIndex) => {
      if (!phase.date_debut && Number(phase.duree_estimee_heures) <= 0) return;
      next.phases = [
        ...next.phases,
        {
          id: `preview-ph-${elementIndex}-${phaseIndex}`,
          element_id: elementId,
          type_phase: phase.type_phase,
          duree_estimee_heures: phase.duree_estimee_heures,
          date_debut: phase.date_debut,
          date_fin: phase.date_fin,
          heure_debut: phase.heure_debut ?? null,
          employe_id: phase.employe_id,
          statut: "a_faire",
          urgent: phase.urgent,
          heures_supplementaires_par_jour:
            phase.heures_supplementaires_par_jour ?? 0,
          dates_estimatives: Boolean(
            phase.dates_estimatives ?? input.dates_estimatives,
          ),
        },
      ];
    });
  });
  return next;
}

export function solutionFingerprint(solution: Pick<PlanningSolution, "patches" | "createChantier">): string {
  const patchKey = solution.patches
    .map(
      (patch) =>
        `${patch.id}:${patch.date_debut}:${patch.date_fin}:${patch.employe_id ?? ""}`,
    )
    .sort()
    .join("|");
  const createKey = (solution.createChantier?.elements ?? [])
    .flatMap((element) =>
      element.phases.map(
        (phase) =>
          `${phase.type_phase}:${phase.date_debut}:${phase.date_fin}:${phase.employe_id ?? ""}`,
      ),
    )
    .join("|");
  return `${patchKey}::${createKey}`;
}

export function solutionTitleFromRepercussions(
  solution: PlanningSolution,
  fallback: string,
): string {
  if (!solution.repercussions.length) {
    return solution.createChantier
      ? `Créer « ${solution.createChantier.nom_client} » sans déplacer d’autre affaire`
      : fallback;
  }
  const clients = Array.from(
    new Set(solution.repercussions.map((row) => row.nom_client)),
  );
  const summary = clients.slice(0, 3).join(", ");
  return `Déplacer ${summary}${clients.length > 3 ? "…" : ""}`;
}

export function describeIncomingDates(input?: NewChantierInput): string {
  if (!input) return "";
  const dated = input.elements.flatMap((element) =>
    element.phases.filter((phase) => phase.date_debut),
  );
  if (!dated.length) return "";
  return dated
    .map(
      (phase) =>
        `${PHASE_LABELS[phase.type_phase]} ${phase.date_debut}${
          phase.date_fin && phase.date_fin !== phase.date_debut
            ? ` → ${phase.date_fin}`
            : ""
        }`,
    )
    .join(" · ");
}
