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
  localCreateChantier,
  localCreateReception,
  localCreateSignalement,
  localCreateDemande,
  localDeleteAbsence,
  localReplaceHoraires,
  localSetChantierOnedriveLink,
  localSetReceptionOnedriveErreur,
  localSetSignalementStatut,
  localUpdateChantier,
  localDeleteChantier,
  localScheduleChantierDay,
  localUpsertEmployee,
  localReorderEmployees,
  loadLocalSnapshot,
} from "@/lib/store/local";
import { fetchPlanningSnapshot, planningMutate } from "@/lib/planning/api";
import { shouldUseSharedDatabase } from "@/lib/supabase/client";
import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/errors";
import type {
  NewAbsenceInput,
  AbsenceUpdateInput,
  NewChantierInput,
  ChantierUpdateInput,
  ScheduleChantierDayInput,
  NewEmployeeInput,
  HoraireSaison,
  NewReceptionInput,
  NewDemandeInput,
  NewSignalementInput,
  PhaseEdits,
  PhasePatch,
  PlanningSnapshot,
  StatutSignalement,
} from "@/lib/types";

type PlanningContextValue = {
  snapshot: PlanningSnapshot;
  loading: boolean;
  error: string | null;
  usingSupabase: boolean;
  databaseUnavailable: boolean;
  refresh: () => Promise<void>;
  createChantier: (input: NewChantierInput) => Promise<void>;
  updateChantier: (input: ChantierUpdateInput) => Promise<void>;
  deleteChantier: (chantierId: string) => Promise<void>;
  scheduleChantierDay: (input: ScheduleChantierDayInput) => Promise<void>;
  upsertEmployee: (input: NewEmployeeInput & { id?: string }) => Promise<void>;
  reorderEmployees: (
    rows: { id: string; ordre_affichage: number }[],
  ) => Promise<void>;
  createAbsence: (input: NewAbsenceInput) => Promise<void>;
  updateAbsence: (input: AbsenceUpdateInput) => Promise<void>;
  deleteAbsence: (id: string) => Promise<void>;
  applyPhasePatches: (patches: PhasePatch[]) => Promise<void>;
  applyPhaseEdits: (edits: PhaseEdits) => Promise<void>;
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
  ) => Promise<void>;
  createReception: (input: NewReceptionInput) => Promise<void>;
  createDemande: (input: NewDemandeInput) => Promise<void>;
  saveHoraires: (rows: HoraireSaison[]) => Promise<void>;
};

async function attachOnedriveFolder(
  input: NewChantierInput,
  chantierId: string,
): Promise<string | null> {
  if (input.lien_dossier_onedrive?.trim()) return null;
  const result = await requestEnsureOnedriveFolder({
    chantierId,
    nomClient: input.nom_client,
  });
  return result.shareUrl ?? null;
}

async function uploadReceptionPng(input: NewReceptionInput, snap: PlanningSnapshot) {
  const phase = snap.phases.find((item) => item.id === input.phase_id);
  const element = snap.elements.find((item) => item.id === phase?.element_id);
  const chantier = snap.chantiers.find((item) => item.id === element?.chantier_id);
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
  });
}

const PlanningContext = createContext<PlanningContextValue | null>(null);

export function PlanningProvider({ children }: { children: React.ReactNode }) {
  const useShared = shouldUseSharedDatabase();
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(() =>
    useShared ? createEmptySnapshot() : createSeedSnapshot(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveSupabase, setLiveSupabase] = useState(false);
  const liveSupabaseRef = useRef(false);
  liveSupabaseRef.current = liveSupabase;

  const assertWritable = useCallback(() => {
    if (useShared && !liveSupabaseRef.current) {
      throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
    }
  }, [useShared]);

  const refresh = useCallback(async () => {
    try {
      if (!useShared) {
        setLiveSupabase(false);
        setSnapshot(loadLocalSnapshot());
        setError(null);
        return;
      }
      const remote = await Promise.race([
        fetchPlanningSnapshot(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(DATABASE_UNAVAILABLE_MESSAGE)), 20000);
        }),
      ]);
      if (!remote.usingSupabase || !remote.snapshot) {
        throw new Error(DATABASE_UNAVAILABLE_MESSAGE);
      }
      setSnapshot(remote.snapshot as PlanningSnapshot);
      setLiveSupabase(true);
      setError(null);
    } catch (err) {
      console.error("[planning] refresh", err);
      setLiveSupabase(false);
      setSnapshot(createEmptySnapshot());
      setError(DATABASE_UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [useShared]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createChantier = useCallback(
    async (input: NewChantierInput) => {
      assertWritable();
      if (useShared) {
        const created = await planningMutate<{ chantierId?: string }>({
          action: "createChantier",
          input,
        });
        const chantierId = created.chantierId ?? "";
        if (chantierId) await attachOnedriveFolder(input, chantierId);
        await refresh();
        return;
      }
      let chantierId = "";
      setSnapshot((current) => {
        const created = localCreateChantier(current, input);
        chantierId = created.chantierId;
        return created.snapshot;
      });
      const shareUrl = await attachOnedriveFolder(input, chantierId);
      if (shareUrl) {
        setSnapshot((current) =>
          localSetChantierOnedriveLink(current, chantierId, shareUrl),
        );
      }
    },
    [useShared, refresh, assertWritable],
  );

  const updateChantier = useCallback(
    async (input: ChantierUpdateInput) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "updateChantier", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localUpdateChantier(current, input));
    },
    [useShared, refresh, assertWritable],
  );

  const deleteChantier = useCallback(
    async (chantierId: string) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "deleteChantier", chantierId });
        await refresh();
        return;
      }
      setSnapshot((current) => localDeleteChantier(current, chantierId));
    },
    [useShared, refresh, assertWritable],
  );

  const scheduleChantierDay = useCallback(
    async (input: ScheduleChantierDayInput) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "scheduleChantierDay", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localScheduleChantierDay(current, input));
    },
    [useShared, refresh, assertWritable],
  );

  const upsertEmployee = useCallback(
    async (input: NewEmployeeInput & { id?: string }) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "upsertEmployee", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localUpsertEmployee(current, input));
    },
    [useShared, refresh, assertWritable],
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
          await planningMutate({ action: "reorderEmployees", rows });
          await refresh();
        } catch (err) {
          await refresh();
          throw err;
        }
        return;
      }
      setSnapshot((current) => localReorderEmployees(current, rows));
    },
    [useShared, refresh, assertWritable],
  );

  const createAbsence = useCallback(
    async (input: NewAbsenceInput) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "createAbsence", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localCreateAbsence(current, input));
    },
    [useShared, refresh, assertWritable],
  );

  const updateAbsence = useCallback(
    async (input: AbsenceUpdateInput) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "updateAbsence", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localUpdateAbsence(current, input));
    },
    [useShared, refresh, assertWritable],
  );

  const deleteAbsence = useCallback(
    async (id: string) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "deleteAbsence", id });
        await refresh();
        return;
      }
      setSnapshot((current) => localDeleteAbsence(current, id));
    },
    [useShared, refresh, assertWritable],
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
        await planningMutate({ action: "applyPhaseEdits", edits });
        await refresh();
        return;
      }
      setSnapshot((current) => localApplyPhaseEdits(current, edits));
    },
    [useShared, refresh, assertWritable],
  );

  const applyPhasePatches = useCallback(
    async (patches: PhasePatch[]) => {
      await applyPhaseEdits({ patches });
    },
    [applyPhaseEdits],
  );

  const createChantierWithPatches = useCallback(
    async (input: NewChantierInput, patches: PhasePatch[]) => {
      assertWritable();
      if (useShared) {
        const created = await planningMutate<{ chantierId?: string }>(
          patches.length > 0
            ? { action: "createChantierWithPatches", input, patches }
            : { action: "createChantier", input },
        );
        const chantierId = created.chantierId ?? "";
        if (chantierId) await attachOnedriveFolder(input, chantierId);
        await refresh();
        return;
      }
      let chantierId = "";
      setSnapshot((current) => {
        const shifted =
          patches.length > 0 ? localApplyPhasePatches(current, patches) : current;
        const created = localCreateChantier(shifted, input);
        chantierId = created.chantierId;
        return created.snapshot;
      });
      const shareUrl = await attachOnedriveFolder(input, chantierId);
      if (shareUrl) {
        setSnapshot((current) =>
          localSetChantierOnedriveLink(current, chantierId, shareUrl),
        );
      }
    },
    [useShared, refresh, assertWritable],
  );

  const createSignalement = useCallback(
    async (input: NewSignalementInput) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "createSignalement", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localCreateSignalement(current, input));
    },
    [useShared, refresh, assertWritable],
  );

  const setSignalementStatut = useCallback(
    async (id: string, statut: StatutSignalement) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "setSignalementStatut", id, statut });
        await refresh();
        return;
      }
      setSnapshot((current) => localSetSignalementStatut(current, id, statut));
    },
    [useShared, refresh, assertWritable],
  );

  const validateSignalement = useCallback(
    async (id: string, patches: PhasePatch[]) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "validateSignalement", id, patches });
        await refresh();
        return;
      }
      setSnapshot((current) => {
        const shifted =
          patches.length > 0 ? localApplyPhasePatches(current, patches) : current;
        return localSetSignalementStatut(shifted, id, "valide");
      });
    },
    [useShared, refresh, assertWritable],
  );

  const createReception = useCallback(
    async (input: NewReceptionInput) => {
      assertWritable();
      const snapForUpload = snapshot;
      if (useShared) {
        await planningMutate({ action: "createReception", input });
        await refresh();
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
        await refresh();
      }
    },
    [useShared, refresh, snapshot, assertWritable],
  );

  const createDemande = useCallback(
    async (input: NewDemandeInput) => {
      assertWritable();
      const message = input.message.trim();
      if (!message) {
        throw new Error("Écrivez un message avant d’envoyer.");
      }
      if (useShared) {
        await planningMutate({
          action: "createDemande",
          input: { ...input, message },
        });
        await refresh();
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
    [useShared, refresh, assertWritable],
  );

  const saveHoraires = useCallback(
    async (rows: HoraireSaison[]) => {
      assertWritable();
      if (useShared) {
        await planningMutate({ action: "saveHoraires", rows });
        await refresh();
        return;
      }
      setSnapshot((current) => localReplaceHoraires(current, rows));
    },
    [useShared, refresh, assertWritable],
  );

  const value = useMemo(
    () => ({
      snapshot,
      loading,
      error,
      usingSupabase: liveSupabase,
      databaseUnavailable: useShared && !loading && !liveSupabase,
      refresh,
      createChantier,
      updateChantier,
      deleteChantier,
      scheduleChantierDay,
      upsertEmployee,
      reorderEmployees,
      createAbsence,
      updateAbsence,
      deleteAbsence,
      applyPhasePatches,
      applyPhaseEdits,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
      createDemande,
      saveHoraires,
    }),
    [
      snapshot,
      loading,
      error,
      liveSupabase,
      useShared,
      refresh,
      createChantier,
      updateChantier,
      deleteChantier,
      scheduleChantierDay,
      upsertEmployee,
      reorderEmployees,
      createAbsence,
      updateAbsence,
      deleteAbsence,
      applyPhasePatches,
      applyPhaseEdits,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
      createDemande,
      saveHoraires,
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
