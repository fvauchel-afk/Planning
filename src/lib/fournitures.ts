export const TYPES_FOURNITURE = ["acier", "accessoire", "autre"] as const;
export type TypeFourniture = (typeof TYPES_FOURNITURE)[number];

export const TYPE_FOURNITURE_LABELS: Record<TypeFourniture, string> = {
  acier: "Acier",
  accessoire: "Accessoire",
  autre: "Autre",
};

export type LigneFourniture = {
  type: TypeFourniture;
  designation: string;
  quantite: number;
  unite: string;
};

export function emptyFournitureRow(): LigneFourniture {
  return { type: "acier", designation: "", quantite: 1, unite: "pièce" };
}

export function parseFournitures(raw: unknown): LigneFourniture[] {
  if (!Array.isArray(raw)) return [];
  const rows: LigneFourniture[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = TYPES_FOURNITURE.includes(row.type as TypeFourniture)
      ? (row.type as TypeFourniture)
      : "autre";
    const designation = String(row.designation ?? "").trim();
    const quantite = Number(row.quantite);
    const unite = String(row.unite ?? "").trim();
    rows.push({
      type,
      designation,
      quantite: Number.isFinite(quantite) ? quantite : 0,
      unite,
    });
  }
  return rows;
}

export function normalizeFournitures(rows: LigneFourniture[]): LigneFourniture[] {
  return rows
    .map((row) => ({
      type: TYPES_FOURNITURE.includes(row.type) ? row.type : "autre",
      designation: row.designation.trim(),
      quantite: Number.isFinite(Number(row.quantite)) ? Number(row.quantite) : 0,
      unite: row.unite.trim(),
    }))
    .filter((row) => row.designation || row.unite || row.quantite);
}

export function formatFournituresMessage(
  nomClient: string,
  rows: LigneFourniture[],
): string {
  const filled = normalizeFournitures(rows);
  const lines = filled.length
    ? filled.map(
        (row) =>
          `- ${TYPE_FOURNITURE_LABELS[row.type]} / ${row.designation || "—"} / ${row.quantite} ${row.unite || ""}`.trim(),
      )
    : ["Aucune fourniture renseignée."];
  return [`Plan validé — ${nomClient}`, "", "Fournitures :", ...lines].join("\n");
}

function runFournituresSelfCheck() {
  const text = formatFournituresMessage("Portail Dupont", [
    { type: "acier", designation: "Tube 40x40", quantite: 12, unite: "ml" },
  ]);
  if (!text.includes("Portail Dupont") || !text.includes("Acier")) {
    throw new Error("fournitures: le message commande doit citer le chantier et le type");
  }
}

runFournituresSelfCheck();
