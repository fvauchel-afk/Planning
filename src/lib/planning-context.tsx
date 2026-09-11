"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createSeedSnapshot } from "@/lib/seed";
import {
  composeReceptionPng,
  requestEnsureOnedriveFolder,
  requestUploadReceptionOnedrive,
} from "@/lib/onedrive/browser";
import {
  localApplyPhasePatches,
  localCreateAbsence,
  localCreateChantier,
  localCreateReception,
  localCreateSignalement,
  localDeleteAbsence,
  localReplaceHoraires,
  localSetChantierOnedriveLink,
  localSetReceptionOnedriveErreur,
  localSetSignalementStatut,
  localUpsertEmployee,
  loadLocalSnapshot,
} from "@/lib/store/local";
import { fetchPlanningSnapshot, planningMutate } from "@/lib/planning/api";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { wrapSupabaseError } from "@/lib/supabase/errors";
import type {
  NewAbsenceInput,
  NewChantierInput,
  NewEmployeeInput,
  HoraireSaison,
  NewReceptionInput,
  NewSignalementInput,
  PhasePatch,
  PlanningSnapshot,
  StatutSignalement,
} from "@/lib/types";

type PlanningContextValue = {
  snapshot: PlanningSnapshot;
  loading: boolean;
  error: string | null;
  usingSupabase: boolean;
  refresh: () => Promise<void>;
  createChantier: (input: NewChantierInput) => Promise<void>;
  upsertEmployee: (input: NewEmployeeInput & { id?: string }) => Promise<void>;
  createAbsence: (input: NewAbsenceInput) => Promise<void>;
  deleteAbsence: (id: string) => Promise<void>;
  applyPhasePatches: (patches: PhasePatch[]) => Promise<void>;
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
  const supabaseConfigured = isSupabaseConfigured();
  const [snapshot, setSnapshot] = useState<PlanningSnapshot>(createSeedSnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveSupabase, setLiveSupabase] = useState(false);

  const refresh = useCallback(async () => {
    try {
      if (!supabaseConfigured) {
        setLiveSupabase(false);
        setSnapshot(loadLocalSnapshot());
        setError(null);
        return;
      }
      const remote = await Promise.race([
        fetchPlanningSnapshot(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Chargement trop long.")), 20000);
        }),
      ]);
      if (!remote.usingSupabase || !remote.snapshot) {
        throw new Error("Impossible de charger le planning depuis le serveur.");
      }
      setSnapshot(remote.snapshot as PlanningSnapshot);
      setLiveSupabase(true);
      setError(null);
    } catch (err) {
      console.error("[planning] refresh", err);
      setLiveSupabase(false);
      setError(wrapSupabaseError(err).message);
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createChantier = useCallback(
    async (input: NewChantierInput) => {
      if (supabaseConfigured) {
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
    [supabaseConfigured, refresh],
  );

  const upsertEmployee = useCallback(
    async (input: NewEmployeeInput & { id?: string }) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "upsertEmployee", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localUpsertEmployee(current, input));
    },
    [supabaseConfigured, refresh],
  );

  const createAbsence = useCallback(
    async (input: NewAbsenceInput) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "createAbsence", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localCreateAbsence(current, input));
    },
    [supabaseConfigured, refresh],
  );

  const deleteAbsence = useCallback(
    async (id: string) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "deleteAbsence", id });
        await refresh();
        return;
      }
      setSnapshot((current) => localDeleteAbsence(current, id));
    },
    [supabaseConfigured, refresh],
  );

  const applyPhasePatches = useCallback(
    async (patches: PhasePatch[]) => {
      if (patches.length === 0) return;
      if (supabaseConfigured) {
        await planningMutate({ action: "applyPhasePatches", patches });
        await refresh();
        return;
      }
      setSnapshot((current) => localApplyPhasePatches(current, patches));
    },
    [supabaseConfigured, refresh],
  );

  const createChantierWithPatches = useCallback(
    async (input: NewChantierInput, patches: PhasePatch[]) => {
      if (supabaseConfigured) {
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
    [supabaseConfigured, refresh],
  );

  const createSignalement = useCallback(
    async (input: NewSignalementInput) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "createSignalement", input });
        await refresh();
        return;
      }
      setSnapshot((current) => localCreateSignalement(current, input));
    },
    [supabaseConfigured, refresh],
  );

  const setSignalementStatut = useCallback(
    async (id: string, statut: StatutSignalement) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "setSignalementStatut", id, statut });
        await refresh();
        return;
      }
      setSnapshot((current) => localSetSignalementStatut(current, id, statut));
    },
    [supabaseConfigured, refresh],
  );

  const validateSignalement = useCallback(
    async (id: string, patches: PhasePatch[]) => {
      if (supabaseConfigured) {
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
    [supabaseConfigured, refresh],
  );

  const createReception = useCallback(
    async (input: NewReceptionInput) => {
      const snapForUpload = snapshot;
      if (supabaseConfigured) {
        await planningMutate({ action: "createReception", input });
        await refresh();
      } else {
        setSnapshot((current) => localCreateReception(current, input));
      }
      const upload = await uploadReceptionPng(input, snapForUpload);
      if (!upload.ok) {
        const message = upload.error ?? "Envoi OneDrive impossible.";
        if (supabaseConfigured) {
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
      } else if (supabaseConfigured) {
        await refresh();
      }
    },
    [supabaseConfigured, refresh, snapshot],
  );

  const saveHoraires = useCallback(
    async (rows: HoraireSaison[]) => {
      if (supabaseConfigured) {
        await planningMutate({ action: "saveHoraires", rows });
        await refresh();
        return;
      }
      setSnapshot((current) => localReplaceHoraires(current, rows));
    },
    [supabaseConfigured, refresh],
  );

  const value = useMemo(
    () => ({
      snapshot,
      loading,
      error,
      usingSupabase: liveSupabase,
      refresh,
      createChantier,
      upsertEmployee,
      createAbsence,
      deleteAbsence,
      applyPhasePatches,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
      saveHoraires,
    }),
    [
      snapshot,
      loading,
      error,
      liveSupabase,
      refresh,
      createChantier,
      upsertEmployee,
      createAbsence,
      deleteAbsence,
      applyPhasePatches,
      createChantierWithPatches,
      createSignalement,
      setSignalementStatut,
      validateSignalement,
      createReception,
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
