export const OUVRAGES_PLAN = ["portail-leo", "garde-corps", "pergola"] as const;
export type OuvragePlan = (typeof OUVRAGES_PLAN)[number];

export const OUVRAGE_PLAN_LABELS: Record<OuvragePlan, string> = {
  "portail-leo": "Portail coulissant — Gamme LEO",
  "garde-corps": "Garde-corps",
  pergola: "Pergola",
};

export function parseOuvragePlan(raw: unknown): OuvragePlan {
  const value = String(raw ?? "");
  return (OUVRAGES_PLAN as readonly string[]).includes(value)
    ? (value as OuvragePlan)
    : "portail-leo";
}

export function planOuvrageStem(ouvrage: OuvragePlan): string {
  if (ouvrage === "garde-corps") return "GardeCorps";
  if (ouvrage === "pergola") return "Pergola";
  return "LEO";
}
