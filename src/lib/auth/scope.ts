import type { SessionUser } from "@/lib/auth/session";
import type { PlanningSnapshot } from "@/lib/types";

type SessionLike = Pick<SessionUser, "employeeId" | "isAdmin">;

export function filterSnapshotForSession(
  snapshot: PlanningSnapshot,
  session: SessionLike,
): PlanningSnapshot {
  if (session.isAdmin) return snapshot;
  const employeeId = session.employeeId;
  const phases = snapshot.phases.filter((phase) => phase.employe_id === employeeId);
  const elementIds = new Set(phases.map((phase) => phase.element_id));
  const elements = snapshot.elements.filter((element) =>
    elementIds.has(element.id),
  );
  const chantierIds = new Set(elements.map((element) => element.chantier_id));
  return {
    ...snapshot,
    employees: snapshot.employees.filter((employee) => employee.id === employeeId),
    phases,
    elements,
    chantiers: snapshot.chantiers.filter((chantier) =>
      chantierIds.has(chantier.id),
    ),
    absences: snapshot.absences.filter(
      (absence) => absence.employe_id === employeeId,
    ),
    signalements: (snapshot.signalements ?? []).filter(
      (row) => row.employe_id === employeeId,
    ),
    receptions: (snapshot.receptions ?? []).filter((row) => {
      const phase = snapshot.phases.find((item) => item.id === row.phase_id);
      return phase?.employe_id === employeeId;
    }),
  };
}
