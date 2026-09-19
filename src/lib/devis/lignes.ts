export type LigneDevis = {
  designation: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
};

export const UNITES_DEVIS = ["u", "ens", "ml", "m²", "h", "forfait"] as const;

export const MAX_LIGNES_DEVIS = 80;
export const MAX_DESIGNATION_DEVIS = 240;

export function emptyLigneDevis(): LigneDevis {
  return {
    designation: "",
    quantite: 1,
    unite: "u",
    prix_unitaire_ht: 0,
  };
}

export function parseLignesDevis(raw: unknown): LigneDevis[] {
  if (!Array.isArray(raw)) return [];
  const rows: LigneDevis[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const quantite = Number(row.quantite);
    const prix = Number(row.prix_unitaire_ht);
    rows.push({
      designation: String(row.designation ?? "").trim(),
      quantite: Number.isFinite(quantite) ? quantite : 0,
      unite: String(row.unite ?? "u").trim() || "u",
      prix_unitaire_ht: Number.isFinite(prix) ? prix : 0,
    });
    if (rows.length >= MAX_LIGNES_DEVIS) break;
  }
  return rows;
}

export function normalizeLignesDevis(rows: LigneDevis[]): LigneDevis[] {
  return rows
    .map((row) => ({
      designation: String(row.designation ?? "")
        .trim()
        .slice(0, MAX_DESIGNATION_DEVIS),
      quantite: Number.isFinite(Number(row.quantite)) ? Number(row.quantite) : 0,
      unite: String(row.unite ?? "u").trim() || "u",
      prix_unitaire_ht: Number.isFinite(Number(row.prix_unitaire_ht))
        ? Number(row.prix_unitaire_ht)
        : 0,
    }))
    .filter((row) => row.designation || row.quantite || row.prix_unitaire_ht);
}

export function ligneMontantHt(row: LigneDevis): number {
  return (Number(row.quantite) || 0) * (Number(row.prix_unitaire_ht) || 0);
}

export type TotauxDevis = {
  ht: number;
  tva: number;
  ttc: number;
};

export function totauxDevis(lignes: LigneDevis[], tvaPct: number): TotauxDevis {
  const ht = lignes.reduce((sum, row) => sum + ligneMontantHt(row), 0);
  const taux = Number.isFinite(tvaPct) ? tvaPct : 0;
  const tva = ht * (taux / 100);
  return { ht, tva, ttc: ht + tva };
}

export function formatMontantFr(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [entier, dec] = v.toFixed(2).split(".");
  const grouped = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${grouped},${dec}`;
}

export function nextNumeroDevis(existing: string[], year: number): string {
  const prefix = `DEV-${year}-`;
  let max = 0;
  for (const numero of existing) {
    if (!numero.startsWith(prefix)) continue;
    const n = Number(numero.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function runLignesSelfCheck() {
  const parsed = parseLignesDevis([
    { designation: " Portail ", quantite: "2", unite: "ens", prix_unitaire_ht: "1500.5" },
    { junk: true },
  ]);
  if (parsed[0]?.designation !== "Portail" || parsed[0]?.quantite !== 2) {
    throw new Error("devis-lignes: parse doit lire désignation et quantité");
  }
  const tot = totauxDevis(
    [{ designation: "A", quantite: 2, unite: "u", prix_unitaire_ht: 100 }],
    20,
  );
  if (Math.round(tot.ht) !== 200 || Math.round(tot.tva) !== 40 || Math.round(tot.ttc) !== 240) {
    throw new Error("devis-lignes: totaux HT/TVA/TTC");
  }
  if (nextNumeroDevis(["DEV-2026-0002", "DEV-2026-0010"], 2026) !== "DEV-2026-0011") {
    throw new Error("devis-lignes: numérotation séquentielle");
  }
  if (formatMontantFr(1234.5) !== "1\u00a0234,50") {
    throw new Error("devis-lignes: format montant FR");
  }
}

if (typeof process !== "undefined" && process.versions?.node) {
  runLignesSelfCheck();
}
