"use client";

import { useCallback, useEffect, useRef } from "react";
import { chantierPhaseOptions } from "@/lib/engine/phase-chain";
import type { Absence, PlanningSnapshot } from "@/lib/types";

export const LIVE_SAVE_DELAY_MS = 650;

export const STALE_CHANTIER_MESSAGE =
  "Ce chantier a été modifié entre-temps par quelqu’un d’autre, voulez-vous recharger la fiche à jour avant de continuer ?";

export const STALE_ABSENCE_MESSAGE =
  "Cette absence a été modifiée entre-temps par quelqu’un d’autre, voulez-vous recharger la fiche à jour avant de continuer ?";

export function confirmStaleReload(message: string): boolean {
  return window.confirm(message);
}

export function chantierCascadeFingerprint(
  snapshot: PlanningSnapshot,
  chantierId: string,
): string {
  const chantier = snapshot.chantiers.find((item) => item.id === chantierId);
  if (!chantier) return "";
  const elementIds = new Set(
    snapshot.elements
      .filter((element) => element.chantier_id === chantierId)
      .map((element) => element.id),
  );
  const phases = snapshot.phases
    .filter((phase) => elementIds.has(phase.element_id))
    .map((phase) => ({
      t: phase.type_phase,
      d: phase.date_debut,
      f: phase.date_fin,
      e: phase.employe_id,
      h: phase.duree_estimee_heures,
    }))
    .sort((a, b) =>
      a.t === b.t
        ? `${a.d ?? ""}:${a.e ?? ""}`.localeCompare(`${b.d ?? ""}:${b.e ?? ""}`)
        : a.t.localeCompare(b.t),
    );
  const opt = chantierPhaseOptions(snapshot, chantierId);
  return JSON.stringify({
    phases,
    pose: opt.avecPose,
    thermo: opt.avecThermolaquage,
    liv: opt.avecLivraison,
    delay: chantier.delai_sous_traitance_jours ?? null,
    st: chantier.sous_traitant_id ?? null,
    estim: Boolean(chantier.dates_estimatives),
  });
}

export function absenceCascadeFingerprint(absence: Absence | undefined): string {
  if (!absence) return "";
  return JSON.stringify({
    employe_id: absence.employe_id,
    date_debut: absence.date_debut.slice(0, 10),
    date_fin: absence.date_fin.slice(0, 10),
  });
}

export function useDebouncedPatch<T extends Record<string, unknown>>(
  apply: (payload: T) => Promise<void>,
  delayMs = LIVE_SAVE_DELAY_MS,
) {
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const payload = pending.current;
    pending.current = null;
    if (!payload || Object.keys(payload).length === 0) return;
    await applyRef.current(payload);
  }, []);

  const schedule = useCallback(
    (partial: T) => {
      pending.current = { ...(pending.current ?? {}), ...partial } as T;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, delayMs);
    },
    [delayMs, flush],
  );

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { schedule, flush, cancel };
}
