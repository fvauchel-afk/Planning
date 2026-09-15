"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MobileShell } from "@/components/MobileShell";
import { colorForChantier } from "@/lib/colors";
import {
  addDays,
  eachDay,
  formatDayHeader,
  formatLongDate,
  isWeekend,
  parseISODate,
  startOfWeekMonday,
  toISODate,
} from "@/lib/dates";
import { assignmentsForCell } from "@/lib/calendar";
import { idsEqual } from "@/lib/auth/ids";
import { usePlanning } from "@/lib/planning-context";
import { PHASE_LABELS } from "@/lib/types";
import { useSession } from "@/lib/auth/session-context";
import { useSalarieId } from "@/lib/use-salarie";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { LaunchValidateButton } from "@/components/LaunchValidateButton";
import { PhaseFicheModal } from "@/components/PhaseFicheModal";
import { fabricationAwaitingLaunch, phaseIsEstimative } from "@/lib/dates-estimatives";

export function MonPlanningPage() {
  const { snapshot, loading } = usePlanning();
  const { session, ready: sessionReady } = useSession();
  const { employeeId, ready } = useSalarieId();
  const [weeks, setWeeks] = useState<1 | 2 | 3>(2);
  const [anchor, setAnchor] = useState(() => startOfWeekMonday(new Date()));
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);

  const employee =
    snapshot.employees.find((item) => idsEqual(item.id, employeeId)) ??
    snapshot.employees.find(
      (item) =>
        session?.nom &&
        item.nom.trim().toLowerCase() === session.nom.trim().toLowerCase(),
    ) ??
    (!session?.isAdmin && snapshot.employees.length === 1
      ? snapshot.employees[0]
      : undefined);
  const rangeStart = toISODate(anchor);
  const days = useMemo(
    () => eachDay(rangeStart, weeks * 7),
    [rangeStart, weeks],
  );
  const todayIso = toISODate(new Date());
  const monthInput = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}`;

  function goToday() {
    setAnchor(startOfWeekMonday(new Date()));
  }

  function shiftWeeks(delta: number) {
    setAnchor(
      startOfWeekMonday(parseISODate(addDays(toISODate(anchor), delta * 7))),
    );
  }

  function jumpToMonth(value: string) {
    const [year, month] = value.split("-").map(Number);
    if (!year || !month) return;
    setAnchor(startOfWeekMonday(new Date(year, month - 1, 1)));
  }

  if (!ready || !sessionReady || loading) {
    return (
      <MobileShell>
        <p className="text-sm text-stone-500">Chargement…</p>
      </MobileShell>
    );
  }

  if (!employee) {
    return (
      <MobileShell>
        <p className="text-sm text-stone-600">
          Impossible d’afficher votre planning. Reconnectez-vous avec votre code
          PIN.
        </p>
      </MobileShell>
    );
  }

  return (
    <MobileShell employeeName={employee.nom}>
      <WelcomeBanner />
      <div className="mb-3 space-y-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => shiftWeeks(-1)}
            className="min-h-11 flex-1 rounded-lg border border-stone-300 bg-white text-sm"
          >
            Sem. préc.
          </button>
          <button
            type="button"
            onClick={goToday}
            className="min-h-11 flex-1 rounded-lg bg-stone-900 text-sm text-white"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => shiftWeeks(1)}
            className="min-h-11 flex-1 rounded-lg border border-stone-300 bg-white text-sm"
          >
            Sem. suiv.
          </button>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-stone-500">Aller au mois</span>
          <input
            type="month"
            value={monthInput}
            onChange={(event) => jumpToMonth(event.target.value)}
            className="w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base"
          />
        </label>
        <p className="text-center text-sm font-medium text-stone-800">
          {formatLongDate(days[0]!)} → {formatLongDate(days.at(-1)!)}
        </p>
      </div>

      <div className="mb-4 flex gap-1 rounded-lg border border-stone-300 bg-white p-1">
        {([1, 2, 3] as const).map((count) => (
          <button
            key={count}
            type="button"
            onClick={() => setWeeks(count)}
            className={`min-h-10 flex-1 rounded-md text-sm ${
              weeks === count
                ? "bg-stone-900 text-white"
                : "text-stone-700"
            }`}
          >
            {count} sem.
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-stone-500">Lecture seule — aucun déplacement possible.</p>

      <div className="space-y-3">
        {days.map((iso) => {
          const header = formatDayHeader(iso);
          const morning = assignmentsForCell(snapshot, employee.id, iso, "matin");
          const afternoon = assignmentsForCell(
            snapshot,
            employee.id,
            iso,
            "apres_midi",
          );
          if (isWeekend(iso) && morning.length === 0 && afternoon.length === 0) {
            return null;
          }
          return (
            <article
              key={iso}
              className={`rounded-xl border bg-white p-3 ${
                iso === todayIso
                  ? "border-amber-400 ring-1 ring-amber-300"
                  : isWeekend(iso)
                    ? "border-stone-200 opacity-70"
                    : "border-stone-300"
              }`}
            >
              <h3 className="text-sm font-medium capitalize text-stone-800">
                {header.weekday} {header.date}
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <SlotBlock
                  title="Matin"
                  assignments={morning}
                  onOpenPhase={setSelectedPhaseId}
                />
                <SlotBlock
                  title="Après-midi"
                  assignments={afternoon}
                  onOpenPhase={setSelectedPhaseId}
                />
              </div>
            </article>
          );
        })}
      </div>
      {selectedPhaseId ? (
        <PhaseFicheModal
          phaseId={selectedPhaseId}
          onClose={() => setSelectedPhaseId(null)}
        />
      ) : null}
    </MobileShell>
  );
}

function SlotBlock({
  title,
  assignments,
  onOpenPhase,
}: {
  title: string;
  assignments: ReturnType<typeof assignmentsForCell>;
  onOpenPhase: (phaseId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="mt-0 text-[10px] uppercase tracking-wide text-stone-500">{title}</p>
      {assignments.length === 0 && (
        <p className="rounded-md bg-stone-50 px-2 py-3 text-xs text-stone-400">Libre</p>
      )}
      {assignments.map((assignment) => {
        const color = colorForChantier(assignment.chantier.id);
        return (
          <div
            key={assignment.phase.id + title}
            className={`rounded-md px-2 py-2 text-xs ${
              fabricationAwaitingLaunch(assignment.phase)
                ? "ring-2 ring-orange-500"
                : ""
            }`}
            style={{ backgroundColor: color.bg, color: color.fg }}
          >
            <button
              type="button"
              onClick={() => onOpenPhase(assignment.phase.id)}
              className="w-full text-left"
            >
              <p className="font-semibold">
                {assignment.chantier.nom_client}
                {fabricationAwaitingLaunch(assignment.phase) ? (
                  <span className="ml-1 rounded bg-orange-600 px-1 text-[9px] font-semibold uppercase tracking-wide text-orange-50">
                    ⚠ à valider
                  </span>
                ) : phaseIsEstimative(assignment.phase) ? (
                  <span className="ml-1 rounded bg-violet-900/80 px-1 text-[9px] font-semibold uppercase tracking-wide text-violet-50">
                    Estimatif
                  </span>
                ) : null}
              </p>
              <p className="opacity-90">
                {assignment.element.nom_element} ·{" "}
                {PHASE_LABELS[assignment.phase.type_phase]}
                {assignment.phase.heures_supplementaires_par_jour
                  ? ` · +${assignment.phase.heures_supplementaires_par_jour}h`
                  : ""}
              </p>
            </button>
            <LaunchValidateButton phaseId={assignment.phase.id} compact />
            {assignment.phase.type_phase === "pose" &&
              assignment.phase.statut !== "termine" && (
                <Link
                  href={`/moi/reception?phase=${assignment.phase.id}`}
                  className="mt-1 block font-medium underline decoration-white/70"
                >
                  Terminer et faire signer
                </Link>
              )}
            {assignment.phase.type_phase === "livraison" &&
              assignment.phase.statut !== "termine" && (
                <Link
                  href={`/moi/reception?phase=${assignment.phase.id}`}
                  className="mt-1 block font-medium underline decoration-white/70"
                >
                  Faire signer le bon de livraison
                </Link>
              )}
            <div className="mt-1.5 grid grid-cols-2 gap-1">
              <Link
                href={`/moi/retard?phase=${assignment.phase.id}&sens=retard`}
                className="rounded bg-black/15 px-1 py-1 text-center text-[10px] font-medium leading-tight"
              >
                Signaler un retard
              </Link>
              <Link
                href={`/moi/retard?phase=${assignment.phase.id}&sens=avance`}
                className="rounded bg-black/15 px-1 py-1 text-center text-[10px] font-medium leading-tight"
              >
                Signaler une avance
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
