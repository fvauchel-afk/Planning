import type { Chantier } from "@/lib/types";

type Origine = Pick<Chantier, "created_by" | "created_at" | "date_creation">;

export const CREATED_BY_AUTOMATIQUE = "Suggestion automatique";

export function formatChantierCreatedBy(chantier: Origine): string {
  const nom = chantier.created_by?.trim();
  return nom || "Inconnu";
}

export function formatChantierCreatedAt(chantier: Origine): string | null {
  const raw = chantier.created_at?.trim() || chantier.date_creation?.trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");
    return `${day}/${month}/${year}`;
  }
  const iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function formatChantierOrigine(chantier: Origine): string {
  const who = formatChantierCreatedBy(chantier);
  const when = formatChantierCreatedAt(chantier);
  return when ? `Créé par ${who} le ${when}` : `Créé par ${who}`;
}
