"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BonCommandeModal } from "@/components/BonCommandeModal";
import { ConflictModal } from "@/components/ConflictModal";
import { canGenerateBonCommande } from "@/lib/bon-commande/active-phase";
import { idsEqual } from "@/lib/auth/ids";
import { useSession } from "@/lib/auth/session-context";
import { phaseIsEstimative } from "@/lib/dates-estimatives";
import { needsAlgoValidation, propositionFromDelay } from "@/lib/signalements";
import { formatLongDate, formatOvertimeHours, shiftToReach } from "@/lib/dates";
import {
  planBestDelayInWindow,
  planDelayCascade,
  type DelayPlanResult,
  type DelayScope,
} from "@/lib/engine/delay";
import { usePlanning } from "@/lib/planning-context";
import {
  PHASE_LABELS,
  PRIORITE_LABELS,
  STATUT_LABELS,
} from "@/lib/types";

export function PhaseFicheModal({
  phaseId,
  onClose,
}: {
  phaseId: string;
  onClose: () => void;
}) {
  const { snapshot, applyPhasePatches, createSignalement, confirmPhaseDates } =
    usePlanning();
  const { session } = useSession();
  const [mode, setMode] = useState<"fiche" | "decaler">("fiche");
  const [delayKind, setDelayKind] = useState<"fixe" | "cible">("fixe");
  const [quantite, setQuantite] = useState("1");
  const [unite, setUnite] = useState<"jours" | "demi">("jours");
  const [targetDate, setTargetDate] = useState("");
  const [flex, setFlex] = useState("3");
  const [scope, setScope] = useState<DelayScope>("dependances");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{
    result: DelayPlanResult;
    halfDays: number;
  } | null>(null);
  const [bonCommande, setBonCommande] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const phase = snapshot.phases.find((item) => item.id === phaseId);
  const element = snapshot.elements.find((item) => item.id === phase?.element_id);
  const chantier = snapshot.chantiers.find(
    (item) => item.id === element?.chantier_id,
  );
  const assignee = snapshot.employees.find((item) => item.id === phase?.employe_id);
  const reception = snapshot.receptions.find((row) => row.phase_id === phaseId);

  const remainingCount = useMemo(() => {
    if (!chantier) return 0;
    const elementIds = snapshot.elements
      .filter((item) => item.chantier_id === chantier.id)
      .map((item) => item.id);
    return snapshot.phases.filter(
      (item) =>
        elementIds.includes(item.element_id) && item.statut !== "termine",
    ).length;
  }, [chantier, snapshot.elements, snapshot.phases]);

  if (!phase || !element || !chantier) {
    return null;
  }

  function halfDaysFromForm(): number {
    const raw = Number(quantite);
    if (!raw || raw <= 0) return 0;
    return unite === "jours" ? raw * 2 : raw;
  }

  function reporterId(): string | null {
    if (phase?.employe_id) return phase.employe_id;
    return (
      snapshot.employees.find(
        (item) => item.actif && item.roles.includes("administratif"),
      )?.id ?? snapshot.employees.find((item) => item.actif)?.id ?? null
    );
  }

  async function applyPlan(
    result: DelayPlanResult,
    halfDays: number,
    forceConflict = false,
  ) {
    setSaving(true);
    setError(null);
    try {
      if (result.status === "conflict" && !forceConflict) {
        setPending({ result, halfDays });
        return;
      }
      const employeId = reporterId();
      const delayNote =
        delayKind === "cible"
          ? [note.trim(), `cible ${targetDate} ±${flex} j. → ${result.chosenStart ?? targetDate}`]
              .filter(Boolean)
              .join(" · ")
          : note.trim();
      if (needsAlgoValidation(result)) {
        if (!employeId) {
          throw new Error("Aucun salarié pour enregistrer la proposition.");
        }
        await createSignalement({
          employe_id: employeId,
          phase_id: phaseId,
          retard_demi_journees: Math.max(1, Math.abs(halfDays)),
          sens: halfDays < 0 ? "avance" : "retard",
          note: delayNote,
          origine: "decalage_admin",
          statut: "en_attente",
          proposition: propositionFromDelay(snapshot, result),
        });
        onClose();
        return;
      }
      if (result.patches.length > 0) {
        await applyPhasePatches(result.patches);
      }
      if (employeId && (halfDays !== 0 || note.trim() || delayKind === "cible")) {
        await createSignalement({
          employe_id: employeId,
          phase_id: phaseId,
          retard_demi_journees: Math.max(1, Math.abs(halfDays)),
          sens: halfDays < 0 ? "avance" : "retard",
          note: delayNote,
          origine: "decalage_admin",
          statut: "valide",
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Décalage impossible.");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!phase?.date_debut || !phase.date_fin) {
      setError("Cette phase n’a pas encore de dates à décaler.");
      return;
    }
    if (delayKind === "cible") {
      if (!targetDate) {
        setError("Indiquez une date cible.");
        return;
      }
      const flexDays = Math.max(0, Number(flex) || 0);
      const result = planBestDelayInWindow(snapshot, phaseId, targetDate, flexDays, {
        scope,
      });
      if (!result.chosenStart && result.patches.length === 0) {
        setError(result.message);
        return;
      }
      const chosen = result.chosenStart ?? targetDate;
      const signed = 2 * shiftToReach(phase.date_debut, chosen);
      void applyPlan(result, signed === 0 ? 1 : signed);
      return;
    }
    const halfDays = halfDaysFromForm();
    if (!halfDays) {
      setError("Indiquez une durée supérieure à 0.");
      return;
    }
    void applyPlan(planDelayCascade(snapshot, phaseId, halfDays, { scope }), halfDays);
  }

  const signedAt = reception?.date_signature
    ? new Date(reception.date_signature).toLocaleString("fr-FR")
    : null;

  const canValidateLaunch =
    phaseIsEstimative(phase) &&
    Boolean(
      session?.isAdmin || idsEqual(phase.employe_id, session?.employeeId),
    );

  async function validateLaunch() {
    setConfirming(true);
    setError(null);
    try {
      await confirmPhaseDates([phaseId]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation impossible.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
        {mode === "fiche" ? (
          <>
            <h3 className="font-serif text-xl text-stone-900">
              {chantier.nom_client} — {element.nom_element}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              {PHASE_LABELS[phase.type_phase]} · {STATUT_LABELS[phase.statut]} ·{" "}
              {PRIORITE_LABELS[chantier.priorite]}
              {phaseIsEstimative(phase) ? " · Estimatif" : ""}
            </p>
            <p className="mt-2 text-sm text-stone-600">
              {assignee
                ? assignee.nom
                : phase.type_phase === "logistique"
                  ? "Thermolaquage sous-traité"
                  : "Personne non assignée"}
              {phase.date_debut
                ? ` · ${formatLongDate(phase.date_debut)} → ${formatLongDate(phase.date_fin ?? phase.date_debut)}`
                : " · pas encore planifiée"}
              {phase.type_phase === "livraison" && phase.duree_estimee_heures
                ? ` · ${phase.duree_estimee_heures} h`
                : ""}
            </p>
            {phase.type_phase === "livraison" ? (
              <div className="mt-2 space-y-1 text-sm text-stone-600">
                {chantier.adresse_livraison ? (
                  <p>Livraison : {chantier.adresse_livraison}</p>
                ) : null}
                {chantier.telephone_livraison ? (
                  <p>Tél. réception : {chantier.telephone_livraison}</p>
                ) : null}
              </div>
            ) : null}
            {phase.heures_supplementaires_par_jour ? (
              <p className="mt-1 text-sm font-medium text-amber-800">
                Heures supplémentaires :{" "}
                {formatOvertimeHours(phase.heures_supplementaires_par_jour)} par
                jour
              </p>
            ) : null}
            {chantier.lien_dossier_onedrive && (
              <a
                href={chantier.lien_dossier_onedrive}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-sky-800 underline"
              >
                Dossier OneDrive
              </a>
            )}
            {reception && (
              <div className="mt-4 space-y-2 text-sm">
                <p>
                  {phase.type_phase === "livraison"
                    ? "Bon de livraison signé le"
                    : "Réception signée le"}{" "}
                  <strong>{signedAt}</strong> par{" "}
                  <strong>{reception.nom_signataire}</strong>.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={reception.image_signature}
                  alt={`Signature de ${reception.nom_signataire}`}
                  className="w-full rounded-lg border border-stone-300 bg-stone-50"
                />
              </div>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {canValidateLaunch ? (
                <button
                  type="button"
                  disabled={confirming}
                  className="rounded-lg bg-violet-800 px-4 py-2 text-sm text-violet-50 disabled:opacity-60"
                  onClick={() => void validateLaunch()}
                >
                  {confirming ? "Validation…" : "Je valide le lancement"}
                </button>
              ) : null}
              {canGenerateBonCommande(snapshot, chantier.id) ? (
                <button
                  type="button"
                  className="rounded-lg bg-amber-800 px-4 py-2 text-sm text-amber-50"
                  onClick={() => setBonCommande(true)}
                >
                  Générer un bon de commande
                </button>
              ) : null}
              {phase.type_phase === "livraison" &&
              !reception &&
              (session?.isAdmin ||
                idsEqual(phase.employe_id, session?.employeeId)) ? (
                <Link
                  href={`/moi/reception?phase=${phase.id}`}
                  className="rounded-lg bg-sky-800 px-4 py-2 text-sm text-sky-50"
                >
                  Faire signer le bon de livraison
                </Link>
              ) : null}
              {session?.isAdmin ? (
              <button
                type="button"
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
                onClick={() => setMode("decaler")}
              >
                Décaler
              </button>
              ) : null}
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-stone-600"
                onClick={onClose}
              >
                Fermer
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <h3 className="font-serif text-xl text-stone-900">Décaler</h3>
            <p className="text-sm text-stone-600">
              {chantier.nom_client} — {element.nom_element} ·{" "}
              {PHASE_LABELS[phase.type_phase]}
            </p>
            <fieldset className="space-y-1 text-sm">
              <legend className="mb-1 font-medium">Mode</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delayKind"
                  checked={delayKind === "fixe"}
                  onChange={() => setDelayKind("fixe")}
                />
                Durée fixe
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="delayKind"
                  checked={delayKind === "cible"}
                  onChange={() => {
                    setDelayKind("cible");
                    if (!targetDate && phase.date_debut) setTargetDate(phase.date_debut);
                  }}
                />
                Date cible approximative
              </label>
            </fieldset>
            {delayKind === "fixe" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Durée</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantite}
                  onChange={(event) => setQuantite(event.target.value)}
                  className="w-24 rounded border border-stone-300 px-3 py-2"
                />
                <select
                  value={unite}
                  onChange={(event) =>
                    setUnite(event.target.value as "jours" | "demi")
                  }
                  className="flex-1 rounded border border-stone-300 px-3 py-2"
                >
                  <option value="jours">jour(s) ouvré(s)</option>
                  <option value="demi">demi-journée(s)</option>
                </select>
              </div>
            </label>
            ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Date cible</span>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Flexibilité (± jours ouvrés)
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={flex}
                  onChange={(event) => setFlex(event.target.value)}
                  className="w-24 rounded border border-stone-300 px-3 py-2"
                />
                <p className="mt-1 text-xs text-stone-500">
                  Le moteur choisit le meilleur jour dans [cible − {flex || 0}, cible
                  + {flex || 0}], en limitant les décalages collatéraux.
                </p>
              </label>
            </div>
            )}
            <fieldset className="space-y-1 text-sm">
              <legend className="mb-1 font-medium">Périmètre</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "dependances"}
                  onChange={() => setScope("dependances")}
                  className="mt-1"
                />
                <span>
                  Cette phase et celles qui en dépendent (même élément) — comme
                  un retard salarié.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "chantier"}
                  onChange={() => setScope("chantier")}
                  className="mt-1"
                />
                <span>
                  Tout le chantier restant ({remainingCount} phase
                  {remainingCount > 1 ? "s" : ""} non terminée
                  {remainingCount > 1 ? "s" : ""}).
                </span>
              </label>
            </fieldset>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Note (optionnel)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="ex. client pas prêt"
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {saving ? "Application…" : "Appliquer le décalage"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                onClick={() => setMode("fiche")}
              >
                Retour
              </button>
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-stone-600"
                onClick={onClose}
              >
                Annuler
              </button>
            </div>
          </form>
        )}
      </div>

      {pending && (
        <ConflictModal
          title="Conflit de priorité"
          message={pending.result.message}
          displacements={pending.result.displacements}
          incoming={[]}
          showIncoming={false}
          validateLabel="Envoyer pour validation"
          adjustLabel="Annuler"
          onValidate={() => {
            const current = pending;
            setPending(null);
            void applyPlan(current.result, current.halfDays, true);
          }}
          onAdjust={() => setPending(null)}
          onCancel={() => setPending(null)}
        />
      )}
      {bonCommande ? (
        <BonCommandeModal
          chantierId={chantier.id}
          onClose={() => setBonCommande(false)}
        />
      ) : null}
    </div>
  );
}
