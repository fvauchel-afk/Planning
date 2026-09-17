/**
 * Ouverture exceptionnelle du planning sans PIN, uniquement les 16 et 17 septembre 2026
 * (fuseau Europe/Paris). À partir du 18/09/2026 00:00, le code PIN est à nouveau exigé.
 *
 * Ne pas prolonger ces dates sans accord : données clients et salariés.
 */

import { parisCalendarYmd } from "@/lib/dates";

export const AUTH_OPEN_FROM_YMD = "2026-09-16";
/** Premier jour où le PIN est de nouveau obligatoire (exclusif). */
export const AUTH_OPEN_UNTIL_YMD = "2026-09-18";

export const AUTH_OPEN_BANNER =
  "Authentification désactivée temporairement — check en cours";

/** Identité de secours si la ligne Jonathan n’est pas lue en base (même UUID que le seed). */
export const CHECK_ADMIN_FALLBACK = {
  employeeId: "11111111-1111-4111-8111-111111111111",
  nom: "Jonathan",
  isAdmin: true as const,
};

export { parisCalendarYmd };

/** Vrai seulement le 16/09/2026 et le 17/09/2026, heure de Paris. */
export function isAuthTemporarilyOpen(now: Date = new Date()): boolean {
  const ymd = parisCalendarYmd(now);
  return ymd >= AUTH_OPEN_FROM_YMD && ymd < AUTH_OPEN_UNTIL_YMD;
}

function runTempOpenCheckSelfCheck() {
  // 16/09/2026 00:00 Paris = 15/09 22:00 UTC (CEST, UTC+2)
  if (!isAuthTemporarilyOpen(new Date("2026-09-15T22:00:00.000Z"))) {
    throw new Error("temp-open-check: le 16/09 à minuit Paris doit être ouvert");
  }
  if (isAuthTemporarilyOpen(new Date("2026-09-15T21:59:59.000Z"))) {
    throw new Error("temp-open-check: le 15/09 au soir Paris doit rester fermé");
  }
  if (!isAuthTemporarilyOpen(new Date("2026-09-16T12:00:00.000Z"))) {
    throw new Error("temp-open-check: le 16/09 en journée doit être ouvert");
  }
  if (!isAuthTemporarilyOpen(new Date("2026-09-17T21:59:59.000Z"))) {
    throw new Error("temp-open-check: le 17/09 23:59 Paris doit encore être ouvert");
  }
  // 18/09/2026 00:00 Paris = 17/09 22:00 UTC
  if (isAuthTemporarilyOpen(new Date("2026-09-17T22:00:00.000Z"))) {
    throw new Error("temp-open-check: le 18/09 à minuit Paris doit réactiver le PIN");
  }
  if (isAuthTemporarilyOpen(new Date("2026-09-18T10:00:00.000Z"))) {
    throw new Error("temp-open-check: le 18/09 en journée doit exiger le PIN");
  }
}

runTempOpenCheckSelfCheck();
