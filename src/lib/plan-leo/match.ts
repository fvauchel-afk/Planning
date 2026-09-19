import { onedriveFolderNamesEqual } from "@/lib/onedrive/share-url";

export function matchByClientNom<T extends { nom_client: string }>(
  rows: T[],
  nom: string,
): T[] {
  const wanted = nom.trim();
  if (!wanted) return [];
  return rows.filter((row) => onedriveFolderNamesEqual(row.nom_client, wanted));
}

export function planLeoFileStem(input: {
  client: string;
  reference: string;
  gamme: string;
  indice: string;
}): string {
  const bits = [
    "Plan",
    input.client.trim() || "client",
    input.reference.trim() || "ref",
    (input.gamme || "LEO").replace(/\s/g, ""),
    `Indice${input.indice.trim() || "A"}`,
  ];
  return bits.join("_");
}
