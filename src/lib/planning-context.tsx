"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createEmptySnapshot, createSeedSnapshot } from "@/lib/seed";
import {
  composeReceptionPng,
  requestEnsureOnedriveFolder,
  requestUploadReceptionOnedrive,
} from "@/lib/onedrive/browser";
import {
  localApplyPhasePatches,
  localApplyPhaseEdits,
  localCreateAbsence,
  localUpdateAbsence,
  localPatchAbsence,
  localCreateChantier,
  localCreateReception,
  localCreateSignalement,
  localCreateDemande,
  localUpdateDemande,
  localDeleteDemande,
  localDeleteAbsence,
  localReplaceHoraires,
  localSetSaisonForcee,
  localSetChantierOnedriveLink,
  localSetReceptionOnedriveErreur,
  localSetSignalementStatut,
  localValidateSignalement,
  localUpdateChantier,
  localPatchChantier,
  localDeleteChantier,
  localScheduleChantierDay,
  localUpsertEmployee,
  localPatchEmployee,
  localReorderEmployees,
  localConfirmPhaseDates,
  localValidateChantierPlan,
  loadLocalSnapshot,
} from "@/lib/store/local";
import { planFinishPhase } from "@/lib/engine/finish-phase";
import { fetchPlanningSnapshot, planningMutate } from "@/lib/planning/api";
import { syntheseMessageConge } from "@/lib/demandes";
import { shouldUseSharedDatabase } from "@/lib/supabase/client";
import { administratifIdlePlans } from "@/lib/engine/administratif-idle";
import { DATABASE_UNAVAILABLE_MESSAGE, formatSaveError } from "@/lib/supabase/errors";
import { useSession } from "@/lib/auth/session-context";
import type {
  Absence,
  NewAbsenceInput,
  AbsenceUpdateInput,
  AbsenceSimplePatch,
  NewChantierInput,
  ChantierUpdateInput,
  ChantierSimplePatch,
  EmployeePatch,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  HoraireSaison,
  NewReceptionInput,
  NewDemandeInput,
  DemandeUpdateInput,
  NewSignalementInput,
  PhaseEdits,
  PhasePatch,
  PlanningSnapshot,
  StatutSignalement,
} from "@/lib/types";

type SaveNotice = { kind: "error" | "warning"; message: string };

type PlanningContextValue = {
  snapshot: PlanningSnapshot;
  loading: boolean;
  error: string | null;
  saveNotice: SaveNotice | null;
  clearSaveNotice: () => void;
  usingSupabase: boolean;
  databaseUnavailable: boolean;
  refresh: (options?: {
    throwOnError?: boolean;
    quiet?: boolean;
  }) => Promise<PlanningSnapshot | void>;
  createChantier: (input: NewChantierInput) => Promise<void>;
  updateChantier: (input: ChantierUpdateInput) => Promise<void>;
  patchChantier: (input: ChantierSimplePatch) => Promise<void>;
  deleteChantier: (chantierId: string) => Promise<void>;
  scheduleChantierDay: (input: ScheduleChantierDayInput) => Promise<void>;
  upsertEmployee: (input: NewEmployeeInput & { id?: string }) => Promise<void>;
  patchEmployee: (input: EmployeePatch) => Promise<void>;
  reorderEmployees: (
    rows: { id: string; ordre_affichage: number }[],
  ) => Promise<void>;
  createAbsence: (input: NewAbsenceInput) => Promise<void>;
  updateAbsence: (input: AbsenceUpdateInput) => Promise<void>;
  patchAbsence: (input: AbsenceSimplePatch) => Promise<void>;
  deleteAbsence: (id: string) => Promise<void>;
  applyPhasePatches: (patches: PhasePatch[]) => Promise<void>;
  applyPhaseEdits: (edits: PhaseEdits) => Promise<void>;
  finishPhase: (phaseId: string) => Promise<void>;
  createChantierWithPatches: (
    input: NewChantierInput,
    patches: PhasePatch[],
  ) => Promise<void>;
  createSignalement: (input: NewSignalementInput) => Promise<void>;
  setSignalementStatut: (
    id: string,
    statut: StatutSignalement,
  ) => Promise<void>;
  validateSignalement: (
    id: string,
    patches: PhasePatch[],
    createChantier?: NewChantierInput | null,
  ) => Promise<void>;
  createReception: (input: NewReceptionInput) => Promise<void>;
  createDemande: (input: NewDemandeInput) => Promise<void>;
  updateDemande: (input: DemandeUpdateInput) => Promise<void>;
  deleteDemande: (id: string) => Promise<void>;
  sendDemandeMail: (id: string, templateId: string) => Promise<void>;
  confirmPhaseDates: (ids: string[]) => Promise<void>;
  validateChantierPlan: (chantierId: string) => Promise<void>;
  saveHoraires: (rows: HoraireSaison[]) => Promise<void>;
  setSaisonForcee: (saison: "ete" | "hiver" | null) => Promise<void>;
  ensureChantierOnedriveFolder: (chantierId: string) => Promise<void>;
  applyAdministratifIdle: (
    employeeId: string,
    decision: "create" | "dismiss",
  ) => Promise<void>;
};

async function attachOnedriveFolder(
  input: { nom_client: string; lien_dossier_onedrive?: string | null },
  chantierId: string,
): Promise<{ shareUrl?: string; error?: string; skipped?: boolean }> {
  if (input.lien_dossier_onedrive?.trim()) return { skipped: true };
  return requestEnsureOnedriveFolder({
    chantierId,
    nomClient: input.nom_client,
  });
}

async function uploadReceptionPng(input: NewReceptionInput, snap: PlanningSnapshot) {
  const phase = snap.phases.find((item) => item.id === input.phase_id);
  const element = snap.elements.find((item) => item.id === phase?.element_id);
  const chantier = snap.chantiers.find((item) => item.id === element?.chantier_id);
  const salarie = snap.employees.find((item) => item.id === phase?.employe_id);
  const isLivraison = phase?.type_phase === "livraison";
  const dateIso = new Date().toISOString();
  const dateLabel = new Date(dateIso).toLocaleString("fr-FR");
  let png = input.image_signature;
  try {
    png = await composeReceptionPng({
      signatureDataUrl: input.image_signature,
      nomClient: chantier?.nom_client ?? "Client",
      nomElement: element?.nom_element ?? "élément",
      nomSignataire: input.nom_signataire,
      dateLabel,
      kind: isLivraison ? "livraison" : "reception",
      adresseLivraison:
        chantier?.adresse_livraison?.trim() || chantier?.adresse || "",
      nomSalarie: salarie?.nom,
      dateLivraison: phase?.date_debut
        ? new Date(`${phase.date_debut}T12:00:00`).toLocaleDateString("fr-FR")
        : dateLabel,
    });
  } catch {
    // On envoie au moins la signature brute.
  }
  return requestUploadReceptionOnedrive({
    phaseId: input.phase_id,
    nomClient: chantier?.nom_client ?? "Client",
    nomElement: element?.nom_element ?? "element",
    nomSignataire: input.nom_signataire,
    dateIso,
    pngDataUrl: png,
    lienDossier: chantier?.lien_dossier_onedrive ?? null,
    kind: isLivraison ? "livraison" : "reception",
  });
}

const PlanningContext = createContext<PlanningContextValue | null>(null);

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const useShared = shouldUseSharedDatabase();
  const { session } = useSession();
  const createdByNom = session?.nom?.trim() || null;
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(() =>
    useShared ? createEmptySnapshot() : createSeedSnapshot(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [liveSupabase, setLiveSupabase] = useState(false);
  const liveSupabaseRef = useRef(false);
  liveSupabaseRef.current = liveSupabase;
  const appliedRefreshAt = useRef(0);

  const assertWritable = useCallback(() => {
    if (useShared && !liveSupabaseRef.current) {
      throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
    }
  }, [useShared]);

  const refresh = useCallback(async (options?: { throwOnError?: boolean; quiet?: boolean }): Promise<PlanningSnapshot | undefined> => {
    const started = Date.now();
    try {
      if (!useShared) {
        setLiveSupabase(false);
        const local = loadLocalSnapshot();
        setSnapshot(local);
        setError(null);
        return local;
      }
      const remote = await Promise.race([
        fetchPlanningSnapshot(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(DATABASE_UNAVAILABLE_MESSAGE)), 45000);
        }),
      ]);
      if (!remote.usingSupabase || !remote.snapshot) {
        throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
      }
      const next = remote.snapshot as PlanningSnapshot;
      if (started < appliedRefreshAt.current) {
        return next;
      }
      appliedRefreshAt.current = started;
      setSnapshot(next);
      setLiveSupabase(true);
      setError(null);
      return next;
    } catch (err) {
      console.error("[planning] refresh", err);
      if (options?.quiet) return undefined;
      setLiveSupabase(false);
      setError(
        err instanceof Error ? err.message : DATABASE_UNAVAILABLE_MESSAGE,
      );
      if (options?.throwOnError) throw err;
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [useShared]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!useShared) return;
    const poll = () => {
      if (document.visibilityState === "visible") {
        void refreshRef.current({ quiet: true });
      }
    };
    const timer = window.setInterval(poll, 4000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [useShared]);

  const clearSaveNotice = useCallback(() => setSaveNotice(null), []);

  const mutate = useCallback(async <T,>(body: Record<string, unknown>) => {
    try {
      setSaveNotice(null);
      return await planningMutate<T>(body);
    } catch (err) {
      setSaveNotice({ kind: "error", message: formatSaveError(err) });
      throw err;
    }
  }, []);

  const queueOnedriveFolder = useCallback(
    (input: { nom_client: string; lien_dossier_onedrive?: string | null }, chantierId: string) => {
      void attachOnedriveFolder(input, chantierId)
        .then(async (result) => {
          if (result.shareUrl) {
            if (!useShared) {
              setSnapshot((current) =>
                localSetChantierOnedriveLink(current, chantierId, result.shareUrl!),
              );
            } else {
              await refresh();
            }
            return;
          }
          if (result.error) {
            setSaveNotice({
              kind: "warning",
              message: `Le chantier est enregistré. Dossier OneDrive non créé : ${result.error}`,
            });
          }
        })
        .catch((err) => {
          setSaveNotice({
            kind: "warning",
            message: `Le chantier est enregistré. Dossier OneDrive non créé : ${
              err instanceof Error ? err.message : "erreur inconnue"
            }`,
          });
        });
    },
    [useShared, refresh],
  );

  const createChantier = useCallback(
    async (input: NewChantierInput) => {
      assertWritable();
      if (useShared) {
        const created = await mutate<{ chantierId?: string }>({
          action: "createChantier",
          input,
        });
        const chantierId = created.chantierId ?? "";
        await refresh({ throwOnError: true });
        if (chantierId) queueOnedriveFolder(input, chantierId);
        return;
      }
      let chantierId = "";
      setSnapshot((current) => {
        const created = localCreateChantier(current, input, createdByNom);
        chantierId = created.chantierId;
        return created.snapshot;
      });
      if (chantierId) queueOnedriveFolder(input, chantierId);
    },
    [useShared, refresh, assertWritable, mutate, queueOnedriveFolder, createdByNom],
  );

  const updateChantier = useCallback(
    async (input: ChantierUpdateInput) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "updateChantier", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localUpdateChantier(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const patchChantier = useCallback(
    async (input: ChantierSimplePatch) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "patchChantier", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localPatchChantier(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const deleteChantier = useCallback(
    async (chantierId: string) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "deleteChantier", chantierId });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localDeleteChantier(current, chantierId));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const scheduleChantierDay = useCallback(
    async (input: ScheduleChantierDayInput) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "scheduleChantierDay", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localScheduleChantierDay(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const upsertEmployee = useCallback(
    async (input: NewEmployeeInput & { id?: string }) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "upsertEmployee", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localUpsertEmployee(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const patchEmployee = useCallback(
    async (input: EmployeePatch) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "patchEmployee", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localPatchEmployee(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const reorderEmployees = useCallback(
    async (rows: { id: string; ordre_affichage: number }[]) => {
      if (rows.length === 0) return;
      assertWritable();
      if (useShared) {
        setSnapshot((current) => ({
          ...current,
          employees: current.employees.map((employee) => {
            const ordre = rows.find((row) => row.id === employee.id)
              ?.ordre_affichage;
            return typeof ordre === "number"
              ? { ...employee, ordre_affichage: ordre }
              : employee;
          }),
        }));
        try {
          await mutate({ action: "reorderEmployees", rows });
          await refresh({ throwOnError: true });
        } catch (err) {
          await refresh();
          throw err;
        }
        return;
      }
      setSnapshot((current) => localReorderEmployees(current, rows));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const createAbsence = useCallback(
    async (input: NewAbsenceInput) => {
      assertWritable();
      if (useShared) {
        const result = await mutate<{ absence?: Absence }>({
          action: "createAbsence",
          input,
        });
        if (result.absence) {
          const created = result.absence;
          setSnapshot((current) => {
            if (current.absences.some((row) => row.id === created.id)) {
              return current;
            }
            return {
              ...current,
              absences: [...current.absences, created],
            };
          });
        }
        const latest = await refresh({ throwOnError: true });
        if (result.absence && latest && !latest.absences.some((row) => row.id === result.absence!.id)) {
          setSnapshot((current) => {
            if (current.absences.some((row) => row.id === result.absence!.id)) {
              return current;
            }
            return {
              ...current,
              absences: [...current.absences, result.absence!],
            };
          });
        }
        return;
      }
      setSnapshot((current) => localCreateAbsence(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const updateAbsence = useCallback(
    async (input: AbsenceUpdateInput) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "updateAbsence", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localUpdateAbsence(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const patchAbsence = useCallback(
    async (input: AbsenceSimplePatch) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "patchAbsence", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localPatchAbsence(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const deleteAbsence = useCallback(
    async (id: string) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "deleteAbsence", id });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localDeleteAbsence(current, id));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const applyPhaseEdits = useCallback(
    async (edits: PhaseEdits) => {
      assertWritable();
      if (
        !edits.patches?.length &&
        !edits.inserts?.length &&
        !edits.deleteIds?.length
      ) {
        return;
      }
      if (useShared) {
        await mutate({ action: "applyPhaseEdits", edits });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localApplyPhaseEdits(current, edits));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const applyPhasePatches = useCallback(
    async (patches: PhasePatch[]) => {
      await applyPhaseEdits({ patches });
    },
    [applyPhaseEdits],
  );

  const finishPhase = useCallback(
    async (phaseId: string) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "finishPhase", phaseId });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => {
        const plan = planFinishPhase(current, phaseId);
        return localApplyPhaseEdits(current, { patches: plan.patches });
      });
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const createChantierWithPatches = useCallback(
    async (input: NewChantierInput, patches: PhasePatch[]) => {
      assertWritable();
      if (useShared) {
        const created = await mutate<{ chantierId?: string }>(
          patches.length > 0
            ? { action: "createChantierWithPatches", input, patches }
            : { action: "createChantier", input },
        );
        const chantierId = created.chantierId ?? "";
        await refresh({ throwOnError: true });
        if (chantierId) queueOnedriveFolder(input, chantierId);
        return;
      }
      let chantierId = "";
      setSnapshot((current) => {
        const shifted =
          patches.length > 0 ? localApplyPhasePatches(current, patches) : current;
        const created = localCreateChantier(shifted, input, createdByNom);
        chantierId = created.chantierId;
        return created.snapshot;
      });
      if (chantierId) queueOnedriveFolder(input, chantierId);
    },
    [useShared, refresh, assertWritable, mutate, queueOnedriveFolder, createdByNom],
  );

  const createSignalement = useCallback(
    async (input: NewSignalementInput) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "createSignalement", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localCreateSignalement(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const setSignalementStatut = useCallback(
    async (id: string, statut: StatutSignalement) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "setSignalementStatut", id, statut });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localSetSignalementStatut(current, id, statut));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const validateSignalement = useCallback(
    async (
      id: string,
      patches: PhasePatch[],
      createChantier?: NewChantierInput | null,
    ) => {
      assertWritable();
      if (useShared) {
        await mutate({
          action: "validateSignalement",
          id,
          patches,
          createChantier,
        });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) =>
        localValidateSignalement(current, id, patches, createChantier, createdByNom),
      );
    },
    [useShared, refresh, assertWritable, mutate, createdByNom],
  );

  const createReception = useCallback(
    async (input: NewReceptionInput) => {
      assertWritable();
      const snapForUpload = snapshot;
      if (useShared) {
        await mutate({ action: "createReception", input });
        await refresh({ throwOnError: true });
      } else {
        setSnapshot((current) => localCreateReception(current, input));
      }
      const upload = await uploadReceptionPng(input, snapForUpload);
      if (!upload.ok) {
        const message = upload.error ?? "Envoi OneDrive impossible.";
        if (useShared) {
          setSnapshot((current) => ({
            ...current,
            receptions: (current.receptions ?? []).map((row) =>
              row.phase_id === input.phase_id
                ? { ...row, onedrive_erreur: message }
                : row,
            ),
          }));
        } else {
          setSnapshot((current) =>
            localSetReceptionOnedriveErreur(current, input.phase_id, message),
          );
        }
      } else if (useShared) {
        await refresh({ throwOnError: true });
      }
    },
    [useShared, refresh, snapshot, assertWritable, mutate],
  );

  const createDemande = useCallback(
    async (input: NewDemandeInput) => {
      assertWritable();
      let message = input.message.trim();
      if (
        !message &&
        input.categorie === "conge" &&
        input.type_absence &&
        input.date_debut &&
        input.date_fin
      ) {
        message = syntheseMessageConge({
          type_absence: input.type_absence,
          date_debut: input.date_debut,
          date_fin: input.date_fin,
          motif_precision: input.motif_precision,
        });
      }
      if (!message) {
        throw new Error("Écrivez un message avant d’envoyer.");
      }
      if (useShared) {
        await mutate({
          action: "createDemande",
          input: { ...input, message },
        });
        await refresh({ throwOnError: true });
        return;
      }
      const employeId = input.employe_id;
      if (!employeId) {
        throw new Error("Employé inconnu.");
      }
      setSnapshot((current) =>
        localCreateDemande(current, {
          ...input,
          message,
          employe_id: employeId,
        }),
      );
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const updateDemande = useCallback(
    async (input: DemandeUpdateInput) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "updateDemande", input });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localUpdateDemande(current, input));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const deleteDemande = useCallback(
    async (id: string) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "deleteDemande", id });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localDeleteDemande(current, id));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const sendDemandeMail = useCallback(
    async (id: string, templateId: string) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "sendDemandeMail", id, templateId });
        return;
      }
      throw new Error(
        "L’envoi d’e-mail n’est disponible qu’avec la base et OneDrive connectés.",
      );
    },
    [useShared, assertWritable, mutate],
  );

  const confirmPhaseDates = useCallback(
    async (ids: string[]) => {
      assertWritable();
      if (!ids.length) return;
      if (useShared) {
        await mutate({ action: "confirmPhaseDates", ids });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localConfirmPhaseDates(current, ids));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const validateChantierPlan = useCallback(
    async (chantierId: string) => {
      assertWritable();
      if (!chantierId) return;
      if (useShared) {
        await mutate({ action: "validateChantierPlan", chantierId });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot(() => {
        const current = loadLocalSnapshot();
        const employeId =
          current.employees.find((row) => row.is_admin)?.id ??
          current.employees[0]?.id ??
          "";
        return localValidateChantierPlan(current, chantierId, employeId);
      });
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const saveHoraires = useCallback(
    async (rows: HoraireSaison[]) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "saveHoraires", rows });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localReplaceHoraires(current, rows));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const setSaisonForcee = useCallback(
    async (saison: "ete" | "hiver" | null) => {
      assertWritable();
      if (useShared) {
        await mutate({ action: "setSaisonForcee", saison });
        await refresh({ throwOnError: true });
        return;
      }
      setSnapshot((current) => localSetSaisonForcee(current, saison));
    },
    [useShared, refresh, assertWritable, mutate],
  );

  const ensureChantierOnedriveFolder = useCallback(
    async (chantierId: string) => {
      const chantier = snapshot.chantiers.find((row) => row.id === chantierId);
      if (!chantier) {
        throw new Error("Chantier introuvable.");
      }
      if (chantier.lien_dossier_onedrive?.trim()) return;
      const result = await attachOnedriveFolder(
        { nom_client: chantier.nom_client },
        chantierId,
      );
      if (result.shareUrl) {
        if (!useShared) {
          setSnapshot((current) =>
            localSetChantierOnedriveLink(current, chantierId, result.shareUrl!),
          );
        } else {
          await refresh();
        }
        return;
      }
      const message =
        result.error || "Création du dossier OneDrive impossible.";
      setSaveNotice({
        kind: "warning",
        message: `Dossier OneDrive non créé : ${message}`,
      });
      throw new Error(message);
    },
    [snapshot.chantiers, useShared, refresh],
  );

  const applyAdministratifIdle = useCallback(
    async (employeeId: string, decision: "create" | "dismiss") => {
      assertWritable();
      if (useShared) {
        await mutate({
          action: "applyAdministratifIdle",
          employeeId,
          decision,
        });
        await refresh({ throwOnError: true });
        return;
      }
      const plan = administratifIdlePlans(snapshot).find(
        (item) => item.employeeId === employeeId,
      );
      if (!plan) {
        throw new Error(
          "Aucun bloc Administratif à proposer pour ce salarié (rôle, déjà occupé ou déjà ignoré).",
        );
      }
      if (decision === "dismiss") {
        setSnapshot((current) =>
          localCreateSignalement(current, {
            employe_id: plan.employeeId,
            phase_id: null,
            retard_demi_journees: 1,
            sens: "retard",
            note: `Proposition Administratif ignorée (${plan.from}).`,
            origine: "decalage_admin",
            statut: "rejete",
            proposition: plan.proposition,
          }),
        );
        return;
      }
      setSnapshot((current) => {
        const created = localCreateChantier(current, plan.input, createdByNom);
        return created.snapshot;
      });
    },
    [useShared, refresh, assertWritable, mutate, snapshot, createdByNom],
  );

  const value = useMemo(
    () => ({
      snapshot,
      loading,
      error,
      saveNotice,
      clearSaveNotice,
      usingSupabase: liveSupabase,
      databaseUnavailable: useShared && !loading && !liveSupabase,
      refresh,
      createChantier,
      updateChantier,
      patchChantier,
      deleteChantier,
      scheduleChantierDay,
      upsertEmployee,
      patchEmployee,
      reorderEmployees,
      createAbsence,
      updateAbsence,
      patchAbsence,
      deleteAbsence,
      applyPhasePatches,
      applyPhaseEdits,
      finishPhase,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
      createDemande,
      updateDemande,
      deleteDemande,
      sendDemandeMail,
      confirmPhaseDates,
      validateChantierPlan,
      saveHoraires,
      setSaisonForcee,
      ensureChantierOnedriveFolder,
      applyAdministratifIdle,
    }),
    [
      snapshot,
      loading,
      error,
      saveNotice,
      clearSaveNotice,
      liveSupabase,
      useShared,
      refresh,
      createChantier,
      updateChantier,
      patchChantier,
      deleteChantier,
      scheduleChantierDay,
      upsertEmployee,
      patchEmployee,
      reorderEmployees,
      createAbsence,
      updateAbsence,
      patchAbsence,
      deleteAbsence,
      applyPhasePatches,
      applyPhaseEdits,
      finishPhase,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
      createDemande,
      updateDemande,
      deleteDemande,
      sendDemandeMail,
      confirmPhaseDates,
      validateChantierPlan,
      saveHoraires,
      setSaisonForcee,
      ensureChantierOnedriveFolder,
      applyAdministratifIdle,
    ],
  );

  return (
    <PlanningContext.Provider value={value}>{children}</PlanningContext.Provider>
  );
}

export function usePlanning() {
  const context = useContext(PlanningContext);
  if (!context) {
    throw new Error("usePlanning must be used within PlanningProvider");
  }
  return context;
}
