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
import {
  fetchSupabaseSnapshot,
  supabaseApplyPhasePatches,
  supabaseCreateAbsence,
  supabaseCreateChantier,
  supabaseCreateReception,
  supabaseCreateSignalement,
  supabaseDeleteAbsence,
  supabaseReplaceHoraires,
  supabaseSetSignalementStatut,
  supabaseUpsertEmployee,
} from "@/lib/store/supabase";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  errorMessage,
  isMissingSchemaError,
  wrapSupabaseError,
} from "@/lib/supabase/errors";
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
      try {
        setSnapshot(loadLocalSnapshot());
      } catch {
        // Conservé : snapshot seed déjà en mémoire.
      }
      setLoading(false);
      try {
        const remote = await Promise.race([
          fetchSupabaseSnapshot(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("Chargement Supabase trop long.")), 20000);
          }),
        ]);
        setSnapshot(remote);
        setLiveSupabase(true);
        setError(null);
      } catch (err) {
        console.error("[supabase] refresh client", err);
        setLiveSupabase(false);
        setError(wrapSupabaseError(err).message);
      }
    } catch (err) {
      setError(errorMessage(err) || "Erreur de chargement");
      try {
        setSnapshot(loadLocalSnapshot());
      } catch {
        setSnapshot(createSeedSnapshot());
      }
    } finally {
      setLoading(false);
    }
  }, [supabaseConfigured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createChantier = useCallback(
    async (input: NewChantierInput) => {
      if (liveSupabase) {
        try {
          const chantierId = await supabaseCreateChantier(input);
          await attachOnedriveFolder(input, chantierId);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) {
            throw wrapSupabaseError(err);
          }
          setLiveSupabase(false);
          setError(wrapSupabaseError(err).message);
        }
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
    [liveSupabase, refresh],
  );

  const upsertEmployee = useCallback(
    async (input: NewEmployeeInput & { id?: string }) => {
      if (liveSupabase) {
        try {
          await supabaseUpsertEmployee(input);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localUpsertEmployee(current, input));
    },
    [liveSupabase, refresh],
  );

  const createAbsence = useCallback(
    async (input: NewAbsenceInput) => {
      if (liveSupabase) {
        try {
          await supabaseCreateAbsence(input);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localCreateAbsence(current, input));
    },
    [liveSupabase, refresh],
  );

  const deleteAbsence = useCallback(
    async (id: string) => {
      if (liveSupabase) {
        try {
          await supabaseDeleteAbsence(id);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localDeleteAbsence(current, id));
    },
    [liveSupabase, refresh],
  );

  const applyPhasePatches = useCallback(
    async (patches: PhasePatch[]) => {
      if (patches.length === 0) return;
      if (liveSupabase) {
        try {
          await supabaseApplyPhasePatches(patches);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localApplyPhasePatches(current, patches));
    },
    [liveSupabase, refresh],
  );

  const createChantierWithPatches = useCallback(
    async (input: NewChantierInput, patches: PhasePatch[]) => {
      if (liveSupabase) {
        try {
          if (patches.length > 0) {
            await supabaseApplyPhasePatches(patches);
          }
          const chantierId = await supabaseCreateChantier(input);
          await attachOnedriveFolder(input, chantierId);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
          setError(wrapSupabaseError(err).message);
        }
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
    [liveSupabase, refresh],
  );

  const createSignalement = useCallback(
    async (input: NewSignalementInput) => {
      if (liveSupabase) {
        try {
          await supabaseCreateSignalement(input);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
          setError(wrapSupabaseError(err).message);
        }
      }
      setSnapshot((current) => localCreateSignalement(current, input));
    },
    [liveSupabase, refresh],
  );

  const setSignalementStatut = useCallback(
    async (id: string, statut: StatutSignalement) => {
      if (liveSupabase) {
        try {
          await supabaseSetSignalementStatut(id, statut);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localSetSignalementStatut(current, id, statut));
    },
    [liveSupabase, refresh],
  );

  const validateSignalement = useCallback(
    async (id: string, patches: PhasePatch[]) => {
      if (liveSupabase) {
        try {
          if (patches.length > 0) {
            await supabaseApplyPhasePatches(patches);
          }
          await supabaseSetSignalementStatut(id, "valide");
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
          setError(wrapSupabaseError(err).message);
        }
      }
      setSnapshot((current) => {
        const shifted =
          patches.length > 0 ? localApplyPhasePatches(current, patches) : current;
        return localSetSignalementStatut(shifted, id, "valide");
      });
    },
    [liveSupabase, refresh],
  );

  const createReception = useCallback(
    async (input: NewReceptionInput) => {
      const snapForUpload = snapshot;
      let usedSupabase = liveSupabase;
      if (usedSupabase) {
        try {
          await supabaseCreateReception(input);
          await refresh();
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          usedSupabase = false;
          setLiveSupabase(false);
          setError(wrapSupabaseError(err).message);
          setSnapshot((current) => localCreateReception(current, input));
        }
      } else {
        setSnapshot((current) => localCreateReception(current, input));
      }
      const upload = await uploadReceptionPng(input, snapForUpload);
      if (!upload.ok) {
        const message = upload.error ?? "Envoi OneDrive impossible.";
        if (usedSupabase) {
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
      } else if (usedSupabase) {
        await refresh();
      }
    },
    [liveSupabase, refresh, snapshot],
  );

  const saveHoraires = useCallback(
    async (rows: HoraireSaison[]) => {
      if (liveSupabase) {
        try {
          await supabaseReplaceHoraires(rows);
          await refresh();
          return;
        } catch (err) {
          if (!isMissingSchemaError(err)) throw wrapSupabaseError(err);
          setLiveSupabase(false);
        }
      }
      setSnapshot((current) => localReplaceHoraires(current, rows));
    },
    [liveSupabase, refresh],
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
