export const FINITIONS_LAQUAGE = [
  "mat",
  "satin",
  "brillant",
  "texture_fin",
] as const;

export type FinitionLaquage = (typeof FINITIONS_LAQUAGE)[number];

export const FINITION_LAQUAGE_LABELS: Record<FinitionLaquage, string> = {
  mat: "Mat",
  satin: "Satin",
  brillant: "Brillant",
  texture_fin: "Texturé fin",
};

export function parseFinitionLaquage(
  raw: unknown,
): FinitionLaquage | null {
  return FINITIONS_LAQUAGE.includes(raw as FinitionLaquage)
    ? (raw as FinitionLaquage)
    : null;
}

function runThermolaquageSelfCheck() {
  if (parseFinitionLaquage("satin") !== "satin") {
    throw new Error("thermolaquage: satin doit être accepté");
  }
  if (parseFinitionLaquage("inconnu") !== null) {
    throw new Error("thermolaquage: une finition inconnue doit être ignorée");
  }
}
runThermolaquageSelfCheck();
