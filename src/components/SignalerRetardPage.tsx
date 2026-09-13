"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileShell } from "@/components/MobileShell";
import { PHASE_LABELS, type SensSignalement } from "@/lib/types";
import { usePlanning } from "@/lib/planning-context";
import { planDelayCascade } from "@/lib/engine/delay";
import { propositionFromDelay } from "@/lib/signalements";
import { useSalarieId } from "@/lib/use-salarie";

export function SignalerRetardPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { snapshot, createSignalement } = usePlanning();
  const { employeeId, ready } = useSalarieId();
  const preset = params.get("phase") ?? "";
  const presetSens = params.get("sens") === "avance" ? "avance" : "retard";
  const [phaseId, setPhaseId] = useState(preset);
  const [sens, setSens] = useState<SensSignalement>(presetSens);
  const [quantite, setQuantite] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPhaseId(preset);
    setSens(presetSens);
  }, [preset, presetSens]);

  const employee = snapshot.employees.find((item) => item.id === employeeId);
  const phases = useMemo(() => {
    if (!employeeId) return [];
    return snapshot.phases.filter(
      (phase) => phase.employe_id === employeeId && phase.date_debut,
    );
  }, [employeeId, snapshot.phases]);

  if (!ready) {
    return (
      <MobileShell>
        <p className="text-sm text-stone-500">Chargement…</p>
      </MobileShell>
    );
  }

  if (!employee) {
    router.replace("/moi");
    return null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!phaseId || !employeeId) {
      setError("Choisissez une phase.");
      return;
    }
    const halfDays = Number(quantite);
    if (!halfDays || halfDays <= 0) {
      setError(
        sens === "avance"
          ? "Indiquez une avance supérieure à 0."
          : "Indiquez un retard supérieur à 0.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const signed = sens === "avance" ? -halfDays : halfDays;
      const preview = planDelayCascade(snapshot, phaseId, signed);
      await createSignalement({
        employe_id: employeeId,
        phase_id: phaseId,
        retard_demi_journees: halfDays,
        sens,
        note: note.trim(),
        proposition: propositionFromDelay(snapshot, preview),
      });
      router.push("/moi");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell employeeName={employee.nom}>
      <h2 className="font-serif text-2xl text-stone-900">
        Signaler {sens === "avance" ? "une avance" : "un retard"}
      </h2>
      <p className="mt-1 mb-4 text-sm text-stone-600">
        Le planning ne change pas tant que Michael ou Alexis n’a pas validé. Une
        avance rapproche les phases suivantes, sans descendre sous 10 à 11 jours
        ouvrés de logistique.
      </p>
      {error && (
        <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="mb-1 block text-sm font-medium">Type</legend>
          {(["retard", "avance"] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-11 items-center justify-center rounded-lg border text-sm ${
                sens === value
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white"
              }`}
            >
              <input
                type="radio"
                className="sr-only"
                name="sens"
                checked={sens === value}
                onChange={() => setSens(value)}
              />
              {value === "retard" ? "Retard" : "Avance"}
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Phase concernée</span>
          <select
            value={phaseId}
            onChange={(event) => setPhaseId(event.target.value)}
            className="w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2"
          >
            <option value="">Choisir…</option>
            {phases.map((phase) => {
              const element = snapshot.elements.find(
                (item) => item.id === phase.element_id,
              );
              const chantier = snapshot.chantiers.find(
                (item) => item.id === element?.chantier_id,
              );
              return (
                <option key={phase.id} value={phase.id}>
                  {chantier?.nom_client} — {element?.nom_element} (
                  {PHASE_LABELS[phase.type_phase]}) · {phase.date_debut}
                </option>
              );
            })}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Durée (demi-journées)</span>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={quantite}
            onChange={(event) => setQuantite(event.target.value)}
            className="w-full min-h-11 rounded-lg border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-stone-300 px-3 py-2"
            placeholder={
              sens === "avance"
                ? "Ex. moins de soudure que prévu…"
                : "Ex. attente pièce, météo…"
            }
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 w-full rounded-lg bg-amber-700 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {saving ? "Envoi…" : "Envoyer le signalement"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/moi")}
          className="min-h-11 w-full rounded-lg border border-stone-300 bg-white text-sm"
        >
          Annuler
        </button>
      </form>
    </MobileShell>
  );
}
