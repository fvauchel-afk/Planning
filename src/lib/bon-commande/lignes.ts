export type LigneBonCommande = {
  quantite: number;
  descriptif: string;
};

export const MAX_LIGNES_BON_COMMANDE = 40;
export const MAX_DESCRIPTIF_BON_COMMANDE = 240;

export function emptyLigneBonCommande(): LigneBonCommande {
  return { quantite: 1, descriptif: "" };
}

export function parseLignesBonCommande(raw: unknown): LigneBonCommande[] {
  if (!Array.isArray(raw)) return [];
  const rows: LigneBonCommande[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const descriptif = String(row.descriptif ?? "").trim();
    const quantite = Number(row.quantite);
    rows.push({
      quantite: Number.isFinite(quantite) ? quantite : 0,
      descriptif,
    });
    if (rows.length >= MAX_LIGNES_BON_COMMANDE) break;
  }
  return rows;
}

export function normalizeLignesBonCommande(
  rows: LigneBonCommande[],
): LigneBonCommande[] {
  return rows
    .map((row) => ({
      quantite: Number.isFinite(Number(row.quantite))
        ? Number(row.quantite)
        : 0,
      descriptif: String(row.descriptif ?? "")
        .trim()
        .slice(0, MAX_DESCRIPTIF_BON_COMMANDE),
    }))
    .filter((row) => row.descriptif)
    .slice(0, MAX_LIGNES_BON_COMMANDE);
}

export function defaultLignesBonCommande(
  elements: { nom_element?: string | null }[],
): LigneBonCommande[] {
  const named = elements
    .map((item) => String(item.nom_element ?? "").trim())
    .filter(Boolean)
    .slice(0, MAX_LIGNES_BON_COMMANDE);
  if (!named.length) return [emptyLigneBonCommande()];
  return named.map((descriptif) => ({ quantite: 1, descriptif }));
}

export function formatQuantiteBonCommande(quantite: number): string {
  if (!Number.isFinite(quantite)) return "0";
  if (Number.isInteger(quantite)) return String(quantite);
  return String(quantite);
}

export function formatLignesBonCommandeText(rows: LigneBonCommande[]): string {
  const filled = normalizeLignesBonCommande(rows);
  if (!filled.length) return "Aucune pièce renseignée.";
  return filled
    .map(
      (row) =>
        `- ${formatQuantiteBonCommande(row.quantite)} × ${row.descriptif}`,
    )
    .join("\n");
}

function runLignesBonCommandeSelfCheck() {
  const parsed = parseLignesBonCommande([
    { quantite: "2", descriptif: "  Portail  " },
    { quantite: 1, descriptif: "" },
  ]);
  const normalized = normalizeLignesBonCommande(parsed);
  if (normalized.length !== 1 || normalized[0]?.quantite !== 2) {
    throw new Error("lignes-bon-commande: la ligne vide doit être ignorée");
  }
  const text = formatLignesBonCommandeText(normalized);
  if (!text.includes("2 × Portail")) {
    throw new Error("lignes-bon-commande: le texte doit citer quantité et descriptif");
  }
  const defaults = defaultLignesBonCommande([
    { nom_element: "Grille" },
    { nom_element: "  " },
  ]);
  if (defaults.length !== 1 || defaults[0]?.descriptif !== "Grille") {
    throw new Error("lignes-bon-commande: défaut depuis les ouvrages du chantier");
  }
}

runLignesBonCommandeSelfCheck();
