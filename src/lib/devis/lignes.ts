export const TAUX_TVA = [0, 2.1, 5.5, 8.5, 10, 20] as const;
export type TauxTva = (typeof TAUX_TVA)[number];

export const UNITES_DEVIS = [
  { v: "article", l: "Article" },
  { v: "forfait", l: "Forfait" },
  { v: "heure", l: "Heure" },
  { v: "jour", l: "Jour" },
  { v: "ml", l: "ML" },
] as const;

export type LigneDevis = {
  designation: string;
  quantite: number;
  unite: string;
  prix_unitaire_ht: number;
  tva_pct: number;
};

export const MAX_LIGNES_DEVIS = 80;
export const MAX_DESIGNATION_DEVIS = 4000;

export function emptyLigneDevis(): LigneDevis {
  return {
    designation: "",
    quantite: 1,
    unite: "article",
    prix_unitaire_ht: 0,
    tva_pct: 20,
  };
}

export function parseTauxTva(raw: unknown): number {
  const n = Number(raw);
  if ((TAUX_TVA as readonly number[]).includes(n)) return n;
  return 20;
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
      unite: String(row.unite ?? "article").trim() || "article",
      prix_unitaire_ht: Number.isFinite(prix) ? prix : 0,
      tva_pct: parseTauxTva(row.tva_pct),
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
      unite: String(row.unite ?? "article").trim() || "article",
      prix_unitaire_ht: Number.isFinite(Number(row.prix_unitaire_ht))
        ? Number(row.prix_unitaire_ht)
        : 0,
      tva_pct: parseTauxTva(row.tva_pct),
    }))
    .filter((row) => row.designation || row.quantite || row.prix_unitaire_ht);
}

export function ligneMontantHt(row: LigneDevis): number {
  return (Number(row.quantite) || 0) * (Number(row.prix_unitaire_ht) || 0);
}

export type RemiseDevis = {
  type: "pourcentage" | "montant";
  valeur: number;
} | null;

export type BucketTva = { taux: number; ht: number; tva: number };

export type TotauxDevis = {
  htBrut: number;
  remise: number;
  ht: number;
  parTaux: BucketTva[];
  tva: number;
  ttc: number;
};

export function totauxDevis(lignes: LigneDevis[], remise: RemiseDevis): TotauxDevis {
  const htBrut = lignes.reduce((sum, row) => sum + ligneMontantHt(row), 0);
  let remiseHt = 0;
  if (remise && remise.valeur > 0) {
    remiseHt =
      remise.type === "pourcentage"
        ? htBrut * (remise.valeur / 100)
        : Math.min(remise.valeur, htBrut);
  }
  const ht = Math.max(0, htBrut - remiseHt);
  const ratio = htBrut > 0 ? ht / htBrut : 1;
  const map = new Map<number, number>();
  for (const row of lignes) {
    const part = ligneMontantHt(row) * ratio;
    map.set(row.tva_pct, (map.get(row.tva_pct) ?? 0) + part);
  }
  const parTaux: BucketTva[] = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([taux, bucketHt]) => ({
      taux,
      ht: bucketHt,
      tva: bucketHt * (taux / 100),
    }));
  const tva = parTaux.reduce((sum, row) => sum + row.tva, 0);
  return { htBrut, remise: remiseHt, ht, parTaux, tva, ttc: ht + tva };
}

export function formatMontantFr(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [entier, dec] = v.toFixed(2).split(".");
  const grouped = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${grouped},${dec}`;
}

function runTotauxSelfCheck() {
  const lignes: LigneDevis[] = [
    { designation: "A", quantite: 1, unite: "u", prix_unitaire_ht: 100, tva_pct: 20 },
    { designation: "B", quantite: 1, unite: "u", prix_unitaire_ht: 100, tva_pct: 10 },
  ];
  const t = totauxDevis(lignes, { type: "montant", valeur: 20 });
  if (Math.round(t.htBrut) !== 200 || Math.round(t.ht) !== 180) {
    throw new Error("devis-totaux: HT après remise 20 €");
  }
  if (t.parTaux.length !== 2) throw new Error("devis-totaux: deux taux");
}

if (typeof window === "undefined") {
  runTotauxSelfCheck();
}
