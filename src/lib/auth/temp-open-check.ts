/**
 * Bypass PIN des 16–17 septembre 2026 : coupé (Jonathan, 17/09 après-midi).
 * Le code PIN est obligatoire pour tout le monde, y compris les admins.
 */

import { parisCalendarYmd } from "@/lib/dates";

/** Conservé pour l’historique ; plus utilisé pour ouvrir l’app. */
export const AUTH_OPEN_FROM_YMD = "2026-09-16";
export const AUTH_OPEN_UNTIL_YMD = "2026-09-18";

export const AUTH_OPEN_BANNER =
  "Authentification désactivée temporairement — check en cours";

/** Identité de secours (plus utilisée tant que le bypass est coupé). */
export const CHECK_ADMIN_FALLBACK = {
  employeeId: "11111111-1111-4111-8111-111111111111",
  nom: "Jonathan",
  isAdmin: true as const,
};

export { parisCalendarYmd };

/** Toujours faux : plus d’entrée sans PIN. */
export function isAuthTemporarilyOpen(_now: Date = new Date()): boolean {
  return false;
}

function runTempOpenCheckSelfCheck() {
  const samples = [
    new Date(),
    new Date("2026-09-15T22:00:00.000Z"),
    new Date("2026-09-16T12:00:00.000Z"),
    new Date("2026-09-17T12:00:00.000Z"),
    new Date("2026-09-17T21:59:59.000Z"),
    new Date("2026-09-17T22:00:00.000Z"),
    new Date("2026-09-18T10:00:00.000Z"),
  ];
  for (const sample of samples) {
    if (isAuthTemporarilyOpen(sample)) {
      throw new Error(
        `temp-open-check: le bypass PIN doit rester coupé (${sample.toISOString()})`,
      );
    }
  }
}

runTempOpenCheckSelfCheck();
