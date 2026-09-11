export function normalizeId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function idsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeId(left);
  const b = normalizeId(right);
  return Boolean(a) && a === b;
}

/** true uniquement pour un booléen réel (évite Boolean("false") === true). */
export function asAdminFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "t";
}
