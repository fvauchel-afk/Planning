"use client";

/* =============================================================================
   LA MÉTALLERIE DU SUD — Planning
   Onglet PLAN — Portail coulissant, gamme LEO
   Questionnaire à menus déroulants + dessin technique coté en temps réel.

   Route : src/app/plan/page.tsx   ·   Lien de navigation : src/components/AppShell.tsx
   Aucune dépendance supplémentaire : React + Tailwind déjà présents dans le projet.
============================================================================= */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlanOuvrageTabs } from "@/components/PlanOuvrageTabs";
import { FormNotice } from "@/components/FormNotice";
import { usePlanning } from "@/lib/planning-context";
import { matchByClientNom } from "@/lib/plan-leo/match";
import type { PlanLeo } from "@/lib/plan-leo/types";

/* ----------------------------------------------------------------------------
   1. CHARTE GRAPHIQUE DU PLAN (dessin technique)
---------------------------------------------------------------------------- */
const BLEU = "#2A5790";
const ACIER = "#3A3A3A";
const GRIS = "#6B7280";
const LIGNE = "#D8DEE6";

/* ----------------------------------------------------------------------------
   2. TYPES ET DONNÉES DE RÉFÉRENCE
---------------------------------------------------------------------------- */
type Params = Record<string, string | number>;
type Etat = "VALIDE" | "CALCULE" | "A_CONFIRMER" | "BLOQUANT";

interface Controle {
  cle: string;
  libelle: string;
  valeur: string;
  etat: Etat;
  note?: string;
}

interface Opt {
  v: string;
  l: string;
}

const opts = (liste: string[][]): Opt[] => liste.map((o) => ({ v: o[0], l: o[1] }));

const RALS: { v: string; l: string; hex: string }[] = [
  { v: "7016", l: "RAL 7016 — Gris anthracite", hex: "#383E42" },
  { v: "9005", l: "RAL 9005 — Noir foncé", hex: "#17171A" },
  { v: "9010", l: "RAL 9010 — Blanc pur", hex: "#F1ECE1" },
  { v: "7039", l: "RAL 7039 — Gris quartz", hex: "#6B665E" },
  { v: "7015", l: "RAL 7015 — Gris ardoise", hex: "#4A4A4A" },
  { v: "9006", l: "RAL 9006 — Aluminium blanc", hex: "#A5A8A6" },
  { v: "6005", l: "RAL 6005 — Vert mousse", hex: "#114232" },
  { v: "8019", l: "RAL 8019 — Brun gris", hex: "#3D3635" },
  { v: "7022", l: "RAL 7022 — Gris terre d'ombre", hex: "#4C4A44" },
  { v: "5011", l: "RAL 5011 — Bleu acier", hex: "#1A2B3C" },
];

const SECTIONS_POUTRE = opts([
  ["100x50x3", "Tube 100 × 50 × 3 mm (LEO 100)"],
  ["120x60x3", "Tube 120 × 60 × 3 mm (LEO 120 — standard)"],
  ["120x60x4", "Tube 120 × 60 × 4 mm (LEO 120 renforcé)"],
  ["150x60x4", "Tube 150 × 60 × 4 mm (LEO 150)"],
  ["150x80x4", "Tube 150 × 80 × 4 mm (LEO 150 renforcé)"],
]);

const SECTIONS_CADRE = opts([
  ["40x40x2", "Tube 40 × 40 × 2 mm"],
  ["50x50x2", "Tube 50 × 50 × 2 mm"],
  ["60x60x2", "Tube 60 × 60 × 2 mm (standard)"],
  ["60x60x3", "Tube 60 × 60 × 3 mm"],
  ["80x80x3", "Tube 80 × 80 × 3 mm"],
]);

const SECTIONS_BARREAU = opts([
  ["20x20x1.5", "Tube 20 × 20 × 1,5 mm"],
  ["25x25x1.5", "Tube 25 × 25 × 1,5 mm (standard)"],
  ["30x30x2", "Tube 30 × 30 × 2 mm"],
  ["40x40x2", "Tube 40 × 40 × 2 mm"],
  ["40x20x2", "Tube 40 × 20 × 2 mm (à plat)"],
]);

const SECTIONS_POTEAU = opts([
  ["80x80x3", "Tube 80 × 80 × 3 mm"],
  ["100x100x3", "Tube 100 × 100 × 3 mm (standard)"],
  ["120x120x4", "Tube 120 × 120 × 4 mm"],
  ["150x150x5", "Tube 150 × 150 × 5 mm"],
]);

/* ----------------------------------------------------------------------------
   3. VALEURS PAR DÉFAUT
---------------------------------------------------------------------------- */
const DEFAUTS: Params = {
  /* Projet */
  ouvrage: "portail-leo",
  client: "",
  reference: "",
  devis: "",
  indice: "A",
  date: "",
  delai: "4 à 5 semaines après validation",
  dessinateur: "Mickael Mahieux",
  statutDoc: "PLAN DE PRINCIPE",

  /* Vue et implantation */
  vue: "exterieure",
  refoulement: "gauche",
  pose: "entre",
  support: "poteaux",
  largeurSupport: 150,

  /* Dimensions */
  passageLibre: 4000,
  hauteurOuvrage: 1600,
  gardeAuSol: 30,
  queue: 2000,
  recouvrement: 50,
  jeuFerme: 20,
  refoulementDispo: 6500,
  cotesFinies: "non",

  /* Gamme et ossature */
  gamme: "LEO 120",
  poutreBasse: "120x60x3",
  cadre: "60x60x2",
  configQueue: "remplie",
  nbTravees: "auto",

  /* Remplissage */
  remplissage: "barreaux-v",
  sectionBarreau: "25x25x1.5",
  entraxeMax: 110,
  toleEp: 2,
  soubassement: 400,

  /* Roulement, rail, guidage */
  roueModele: "GO Rolling Center — gorge V",
  roueDiam: 120,
  positionRoues: "auto",
  axeRoueArriere: 300,
  entraxeRoues: 2000,
  rail: "rond20",
  guidage: "poteau",
  nbGalets: 2,
  butees: "oui",

  /* Réception et poteaux */
  poteauGuidage: "oui",
  poteauReception: "oui",
  sectionPoteau: "100x100x3",
  hauteurPoteauMode: "auto",
  hauteurPoteau: 1800,
  profilReception: "U",

  /* Motorisation */
  motorisation: "manuel",
  modeleMoteur: "",
  cremaillere: "non",

  /* Finition */
  ral: "7016",
  aspect: "mat",
  preparation: "thermolaquage direct",

  /* Affichage */
  rendu: "technique",
  fantome: "oui",
  cotes: "oui",
  cotesRoues: "oui",
  cartouche: "oui",
  logoOfficiel: "non",
};

function mergeParams(raw: Record<string, string | number>): Params {
  const next: Params = { ...DEFAUTS };
  for (const key of Object.keys(DEFAUTS)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const def = DEFAUTS[key];
    next[key] = typeof def === "number" ? Number(raw[key]) || 0 : String(raw[key]);
  }
  return next;
}

function svgDuPlan(): string {
  if (typeof document === "undefined") return "";
  const n = document.getElementById("plan-leo-svg");
  if (!n) return "";
  return new XMLSerializer().serializeToString(n);
}

/* ----------------------------------------------------------------------------
   4. OUTILS DE CALCUL
---------------------------------------------------------------------------- */
interface Sec {
  h: number;
  l: number;
  e: number;
}

function sec(code: string): Sec {
  const m = String(code).split("x");
  const h = parseFloat(m[0]) || 60;
  const l = parseFloat(m[1]) || h;
  const e = parseFloat(m[2]) || 2;
  return { h, l, e };
}

/** Masse linéique d'un tube rectangulaire, en kg/m (acier 7,85). */
function kgParM(s: Sec): number {
  const aire = (2 * (s.h + s.l) - 4 * s.e) * s.e; // mm²
  return aire * 0.00785;
}

/** Répartition d'un remplissage régulier dans une largeur libre. */
function repartition(largeurLibre: number, largeurElement: number, jeuMax: number) {
  if (largeurLibre <= jeuMax || largeurElement <= 0) {
    return { nb: 0, jeu: Math.max(0, largeurLibre), entraxe: 0 };
  }
  const nb = Math.max(1, Math.ceil((largeurLibre - jeuMax) / (largeurElement + jeuMax)));
  const jeu = (largeurLibre - nb * largeurElement) / (nb + 1);
  return { nb, jeu, entraxe: jeu + largeurElement };
}

const mm = (v: number): string => `${Math.round(v)} mm`;
const arrondi = (v: number, d = 1): number => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

/** Distance fixe de chaque bord du vantail, selon la longueur totale L. */
function offsetRouesAuto(longueurVantail: number): number {
  const L = Math.round(longueurVantail);
  if (L > 6000) return 1500;
  if (L >= 4501) return 1200;
  return 1000;
}

function positionRouesAuto(longueurVantail: number): { d1: number; ent: number } {
  const L = Math.max(0, Math.round(longueurVantail));
  const off = offsetRouesAuto(L);
  if (2 * off >= L) {
    const d1 = Math.round(L / 2);
    return { d1, ent: Math.max(0, L - 2 * d1) };
  }
  return { d1: off, ent: L - 2 * off };
}

function runRouesPoteauxSelfCheck() {
  const a = positionRouesAuto(4000);
  if (a.d1 !== 1000 || a.ent !== 2000) {
    throw new Error("roues auto 4000 : 1000 de chaque bord, entraxe 2000");
  }
  const b = positionRouesAuto(4500);
  if (b.d1 !== 1000 || b.ent !== 2500) {
    throw new Error("roues auto 4500 : encore 1000 de chaque bord");
  }
  const c = positionRouesAuto(4501);
  if (c.d1 !== 1200 || c.ent !== 4501 - 2400) {
    throw new Error("roues auto 4501 : 1200 de chaque bord");
  }
  const d = positionRouesAuto(6000);
  if (d.d1 !== 1200 || d.ent !== 3600) {
    throw new Error("roues auto 6000 : 1200 de chaque bord");
  }
  const e = positionRouesAuto(6001);
  if (e.d1 !== 1500 || e.ent !== 6001 - 3000) {
    throw new Error("roues auto au-delà de 6000 : 1500 de chaque bord");
  }
}

if (typeof process !== "undefined" && process.versions?.node) {
  runRouesPoteauxSelfCheck();
}

/* ----------------------------------------------------------------------------
   5. PETITS COMPOSANTS D'INTERFACE (habillage Tailwind de l'application)
---------------------------------------------------------------------------- */
const CHAMP =
  "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100 disabled:text-stone-400";

function Bloc(props: {
  titre: string;
  ouvert: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.ouvert}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-stone-900 hover:bg-stone-50"
      >
        <span>{props.titre}</span>
        <span aria-hidden className="text-lg leading-none text-amber-700">
          {props.ouvert ? "−" : "+"}
        </span>
      </button>
      {props.ouvert ? (
        <div className="space-y-3 border-t border-stone-200 px-3 py-3">{props.children}</div>
      ) : null}
    </div>
  );
}

function Ligne(props: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-stone-600">
        {props.label}
        {props.aide ? (
          <em className="block not-italic text-[11px] text-stone-400">{props.aide}</em>
        ) : null}
      </span>
      <span className="mt-1 block">{props.children}</span>
    </label>
  );
}

function Deroulant(props: {
  value: string;
  onChange: (v: string) => void;
  options: Opt[];
  disabled?: boolean;
}) {
  return (
    <select
      className={CHAMP}
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function Nombre(props: {
  value: number;
  onChange: (v: number) => void;
  pas?: number;
  min?: number;
  max?: number;
  unite?: string;
  presets?: number[];
  disabled?: boolean;
}) {
  const pas = props.pas || 10;
  const borne = (v: number) => {
    let x = v;
    if (props.min !== undefined) x = Math.max(props.min, x);
    if (props.max !== undefined) x = Math.min(props.max, x);
    return Math.round(x);
  };
  const [saisie, setSaisie] = useState(String(props.value));
  useEffect(() => {
    setSaisie(String(props.value));
  }, [props.value]);
  const commit = (brut: string) => {
    const n = parseFloat(brut.replace(",", "."));
    const v = borne(Number.isFinite(n) ? n : props.value);
    props.onChange(v);
    setSaisie(String(v));
  };
  const petit =
    "h-8 w-8 shrink-0 rounded-md border border-stone-300 bg-white text-base font-semibold text-amber-700 hover:border-stone-400 disabled:opacity-40";
  return (
    <span className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Diminuer"
        className={petit}
        disabled={props.disabled}
        onClick={() => props.onChange(borne(props.value - pas))}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        step="any"
        className={`${CHAMP} min-w-0 flex-1 text-right tabular-nums`}
        value={saisie}
        disabled={props.disabled}
        onChange={(e) => {
          const brut = e.target.value;
          setSaisie(brut);
          if (brut === "" || brut === "-" || brut === "." || brut === ",") return;
          const n = parseFloat(brut.replace(",", "."));
          if (!Number.isFinite(n)) return;
          if (props.min !== undefined && n < props.min) return;
          if (props.max !== undefined && n > props.max) return;
          props.onChange(Math.round(n));
        }}
        onBlur={() => commit(saisie)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <button
        type="button"
        aria-label="Augmenter"
        className={petit}
        disabled={props.disabled}
        onClick={() => props.onChange(borne(props.value + pas))}
      >
        +
      </button>
      {props.unite ? (
        <span className="shrink-0 text-xs text-stone-500">{props.unite}</span>
      ) : null}
      {props.presets && props.presets.length > 0 ? (
        <select
          aria-label="Valeurs courantes"
          className="w-[76px] shrink-0 rounded-md border border-stone-300 bg-white px-1 py-1.5 text-xs text-stone-500 disabled:bg-stone-100"
          value=""
          disabled={props.disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) props.onChange(borne(v));
          }}
        >
          <option value="">Courant…</option>
          {props.presets.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      ) : null}
    </span>
  );
}

function Texte(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
}) {
  return (
    <input
      type="text"
      className={CHAMP}
      value={props.value}
      placeholder={props.placeholder || ""}
      list={props.list}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

const TON_ETAT: Record<Etat, { t: string; c: string }> = {
  VALIDE: { t: "VALIDÉ", c: "border-emerald-300 bg-emerald-100 text-emerald-900" },
  CALCULE: { t: "CALCULÉ", c: "border-stone-300 bg-stone-100 text-stone-700" },
  A_CONFIRMER: { t: "À CONFIRMER", c: "border-amber-300 bg-amber-100 text-amber-950" },
  BLOQUANT: { t: "BLOQUANT", c: "border-red-300 bg-red-100 text-red-900" },
};

function Pastille(props: { etat: Etat }) {
  const s = TON_ETAT[props.etat];
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.c}`}
    >
      {s.t}
    </span>
  );
}

function LigneTable(props: { libelle: string; valeur: React.ReactNode; note?: string; etat?: Etat }) {
  return (
    <tr className="border-t border-stone-200 align-top">
      <td className="px-3 py-2 text-stone-600">{props.libelle}</td>
      <td className="px-3 py-2 text-stone-900">
        {props.valeur}
        {props.note ? (
          <em className="mt-0.5 block not-italic text-xs text-amber-800">{props.note}</em>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right">
        {props.etat ? <Pastille etat={props.etat} /> : null}
      </td>
    </tr>
  );
}

const CSS_IMPRESSION = `
@media print {
  @page { size: A4 landscape; margin: 8mm; }
  header, .plan-no-print { display: none !important; }
  body { background: #ffffff !important; }
  main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
  .plan-feuille { border: 0 !important; padding: 0 !important; }
  .plan-apercu {
    position: static !important;
    max-height: none !important;
    overflow: visible !important;
  }
}
`;


/* ----------------------------------------------------------------------------
   6. COMPOSANT
---------------------------------------------------------------------------- */

export function PlanPortailLeo() {
  const searchParams = useSearchParams();
  const { snapshot } = usePlanning();
  const [p, setP] = useState<Params>(DEFAUTS);
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({
    projet: false,
    vue: true,
    dim: true,
    ossature: true,
    remplissage: true,
    roulement: false,
    reception: false,
    moteur: false,
    finition: false,
    affichage: false,
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [lienChantierId, setLienChantierId] = useState<string | null>(
    searchParams.get("chantier")?.trim() || null,
  );

  useEffect(() => {
    setP((prev) => (prev.date ? prev : { ...prev, date: new Date().toLocaleDateString("fr-FR") }));
  }, []);

  useEffect(() => {
    const id = searchParams.get("id")?.trim();
    const chantierId = searchParams.get("chantier")?.trim();
    const clientQ = searchParams.get("client")?.trim();
    let cancelled = false;

    async function load() {
      try {
        if (id) {
          const res = await fetch(`/api/plan-leo?id=${encodeURIComponent(id)}`, { cache: "no-store" });
          const data = (await res.json()) as { plan?: PlanLeo; error?: string };
          if (!res.ok) throw new Error(data.error || "Lecture du plan impossible.");
          if (cancelled || !data.plan) return;
          setPlanId(data.plan.id);
          setLienChantierId(data.plan.chantier_id);
          setP(mergeParams(data.plan.params));
          setOuverts((o) => ({ ...o, projet: true }));
          return;
        }
        if (chantierId) setLienChantierId(chantierId);
        const qs = new URLSearchParams();
        if (chantierId) qs.set("chantierId", chantierId);
        if (clientQ) qs.set("client", clientQ);
        if (!qs.toString()) return;
        const res = await fetch(`/api/plan-leo?${qs.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as { rows?: PlanLeo[]; error?: string };
        if (!res.ok) throw new Error(data.error || "Lecture du plan impossible.");
        const plan = (data.rows ?? []).find(
          (row) => String(row.params.ouvrage ?? "portail-leo") === "portail-leo",
        );
        if (cancelled || !plan) {
          if (clientQ) {
            setP((prev) => (prev.client ? prev : { ...prev, client: clientQ }));
          }
          return;
        }
        setPlanId(plan.id);
        setLienChantierId(plan.chantier_id || chantierId || null);
        setP(mergeParams(plan.params));
        setOuverts((o) => ({ ...o, projet: true }));
      } catch (err) {
        if (!cancelled) {
          setSaveErr(err instanceof Error ? err.message : "Lecture du plan impossible.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    const chantierId = searchParams.get("chantier")?.trim();
    if (!chantierId) return;
    const chantier = snapshot.chantiers.find((c) => c.id === chantierId);
    if (!chantier) return;
    setLienChantierId(chantierId);
    setP((prev) => (prev.client ? prev : { ...prev, client: chantier.nom_client }));
  }, [searchParams, snapshot.chantiers]);

  const set = (k: string, v: string | number) => setP((prev) => ({ ...prev, [k]: v }));
  const S = useCallback((k: string): string => String(p[k] ?? ""), [p]);
  const N = useCallback((k: string): number => Number(p[k] ?? 0), [p]);
  const bascule = (k: string) => setOuverts((o) => ({ ...o, [k]: !o[k] }));

  /* ==========================================================================
     6.1 GÉOMÉTRIE (recalculée à chaque changement)
  ========================================================================== */
  const G = useMemo(() => {
    const PL = Math.max(200, N("passageLibre"));
    const H = Math.max(200, N("hauteurOuvrage"));
    const GS = Math.max(0, N("gardeAuSol"));
    const Q = Math.max(0, N("queue"));
    const REC = Math.max(0, N("recouvrement"));
    const L = Q + PL + REC;
    const HT = H + GS; // hauteur hors tout depuis le sol fini

    const pb = sec(S("poutreBasse"));
    const cd = sec(S("cadre"));
    const bar = sec(S("sectionBarreau"));
    const pot = sec(S("sectionPoteau"));

    const Hp = pb.h;
    const Sc = cd.h;
    const Lb = bar.h;

    const railH = S("rail") === "rond20" ? 20 : S("rail") === "visser" ? 12 : 0;
    const yBas = GS;
    const yHaut = GS + H;

    /* --- zone d'ossature remplie --- */
    const cfg = S("configQueue");
    const xArr = cfg === "remplie" ? -Q : 0; // début du cadre rempli
    const xAv = PL + REC; // extrémité avant (côté réception)
    const xTrav = cfg === "poutre" ? 0 : -Q; // départ de la traverse haute
    const cadreL = xAv - xArr;
    const intL = Math.max(0, cadreL - 2 * Sc);

    let nTrav = 1;
    if (S("nbTravees") === "auto") nTrav = Math.max(1, Math.ceil(intL / 2200));
    else nTrav = Math.max(1, parseInt(S("nbTravees"), 10) || 1);

    const largTravee = nTrav > 0 ? (intL - (nTrav - 1) * Sc) / nTrav : intL;

    /* --- montants --- */
    const montants: number[] = []; // x du bord gauche de chaque montant
    montants.push(xArr);
    for (let i = 0; i < nTrav - 1; i++) montants.push(xArr + Sc + (i + 1) * largTravee + i * Sc);
    montants.push(xAv - Sc);
    if (cfg !== "remplie" && Q > 0) montants.push(xTrav); // montant d'extrémité de queue

    /* --- remplissage --- */
    const type = S("remplissage");
    const soub = Math.max(0, N("soubassement"));
    const yRempBas = yBas + Hp;
    const yRempHaut = yHaut - Sc;
    const hLibre = Math.max(0, yRempHaut - yRempBas);

    const rep = repartition(largTravee, Lb, Math.max(20, N("entraxeMax")));
    const repH = repartition(hLibre, Lb, Math.max(20, N("entraxeMax")));
    const repLames = repartition(hLibre, 100, 20);

    let nbBarreauxTotal = 0;
    let mlBarreaux = 0;
    let surfaceTole = 0; // m²

    const hBarreauxMixte = Math.max(0, hLibre - soub - Sc);

    if (type === "barreaux-v") {
      nbBarreauxTotal = rep.nb * nTrav;
      mlBarreaux = (nbBarreauxTotal * hLibre) / 1000;
    } else if (type === "barreaux-h") {
      nbBarreauxTotal = repH.nb * nTrav;
      mlBarreaux = (repH.nb * nTrav * largTravee) / 1000;
    } else if (type === "lames-h") {
      nbBarreauxTotal = repLames.nb * nTrav;
      surfaceTole = (repLames.nb * nTrav * largTravee * 100) / 1e6;
    } else if (type === "tole" || type === "microperfore") {
      surfaceTole = (intL * hLibre) / 1e6;
    } else if (type === "mixte") {
      const repM = repartition(largTravee, Lb, Math.max(20, N("entraxeMax")));
      nbBarreauxTotal = repM.nb * nTrav;
      mlBarreaux = (nbBarreauxTotal * hBarreauxMixte) / 1000;
      surfaceTole = (intL * soub) / 1e6;
    }

    /* --- roues --- */
    const D = Math.max(60, N("roueDiam"));
    const R = D / 2;
    const profGorge = Math.round(D / 10);
    const yAxeRoue = railH + (R - profGorge);
    const auto = S("positionRoues") === "auto";
    const posAuto = positionRouesAuto(L);
    const d1 = auto ? posAuto.d1 : Math.max(0, N("axeRoueArriere"));
    const ent = auto ? posAuto.ent : Math.max(100, N("entraxeRoues"));
    const xRoue1 = -Q + d1;
    const xRoue2 = xRoue1 + ent;
    const d2 = xAv - xRoue2; // distance axe roue avant / extrémité avant
    const hautRoue = yAxeRoue + R;
    const encastrement = Hp > 0 ? Math.min(100, Math.max(0, ((hautRoue - yBas) / D) * 100)) : 0;

    /* --- poids estimatif --- */
    const kgPoutre = kgParM(pb);
    const kgCadre = kgParM(cd);
    const kgBar = kgParM(bar);
    const mlPoutre = L / 1000;
    const mlTraverse = (xAv - xTrav) / 1000;
    const nbMontants = montants.length;
    const longMontant = Math.max(0, yHaut - Sc - (yBas + Hp));
    const mlMontants = (nbMontants * longMontant) / 1000;
    const mlTraverseInter = type === "mixte" ? (intL * 1) / 1000 : 0;
    const poidsAcier =
      mlPoutre * kgPoutre + (mlTraverse + mlTraverseInter) * kgCadre + mlMontants * kgCadre + mlBarreaux * kgBar;
    const epTole = Math.max(0, N("toleEp"));
    const poidsTole = surfaceTole * epTole * 7.85 * (type === "microperfore" ? 0.72 : 1);
    const poidsTotal = poidsAcier + poidsTole + 18; // + roues, galets, visserie (forfait)

    /* --- occultation / prise au vent --- */
    let occultation = 0;
    if (type === "tole") occultation = 1;
    else if (type === "microperfore") occultation = 0.72;
    else if (type === "lames-h") occultation = 0.9;
    else if (type === "barreaux-v") occultation = largTravee > 0 ? (rep.nb * Lb) / largTravee : 0;
    else if (type === "barreaux-h") occultation = hLibre > 0 ? (repH.nb * Lb) / hLibre : 0;
    else if (type === "mixte") occultation = hLibre > 0 ? (soub + ((hLibre - soub) * ((rep.nb * Lb) / Math.max(1, largTravee)))) / hLibre : 0;
    const surfaceOuvrage = (L * H) / 1e6;

    /* --- refoulement --- */
    const refNecessaire = L + 100;
    const refDispo = Math.max(0, N("refoulementDispo"));

    /* --- poteaux acier : hors tout + 60 mm, sauf saisie manuelle --- */
    const hPoteauAuto = HT + 60;
    const hPoteau =
      S("hauteurPoteauMode") === "manuel"
        ? Math.max(300, N("hauteurPoteau"))
        : hPoteauAuto;

    return {
      PL, H, GS, Q, REC, L, HT, hPoteauAuto, hPoteau,
      pb, cd, bar, pot, Hp, Sc, Lb,
      railH, yBas, yHaut,
      cfg, xArr, xAv, xTrav, cadreL, intL, nTrav, largTravee, montants,
      type, soub, yRempBas, yRempHaut, hLibre, rep, repH, repLames, hBarreauxMixte,
      nbBarreauxTotal, mlBarreaux, surfaceTole,
      longMontant, D, R, yAxeRoue, xRoue1, xRoue2, d1, d2, ent, encastrement,
      poidsAcier, poidsTole, poidsTotal, occultation, surfaceOuvrage,
      refNecessaire, refDispo,
    };
  }, [S, N]);

  /* ==========================================================================
     6.2 CONTRÔLES TECHNIQUES ET STATUTS
  ========================================================================== */
  const controles: Controle[] = useMemo(() => {
    const c: Controle[] = [];
    const add = (cle: string, libelle: string, valeur: string, etat: Etat, note?: string) =>
      c.push({ cle, libelle, valeur, etat, note });

    add(
      "geo",
      "Longueur totale du vantail",
      `${mm(G.Q)} (queue) + ${mm(G.PL)} (passage) + ${mm(G.REC)} (recouvrement) = ${mm(G.L)}`,
      "CALCULE"
    );
    add(
      "ht",
      "Hauteur hors tout depuis le sol fini",
      `${mm(G.H)} (ouvrage) + ${mm(G.GS)} (garde au sol) = ${mm(G.HT)}`,
      "CALCULE"
    );
    add(
      "poteaux",
      "Cote des poteaux acier",
      S("hauteurPoteauMode") === "manuel"
        ? `${mm(G.hPoteau)} saisie manuelle (auto serait ${mm(G.hPoteauAuto)})`
        : `${mm(G.HT)} hors tout + 60 mm = ${mm(G.hPoteau)}`,
      S("hauteurPoteauMode") === "manuel" ? "A_CONFIRMER" : "CALCULE",
      S("hauteurPoteauMode") === "manuel"
        ? "Saisie manuelle déconseillée : la cote auto est hors tout + 60 mm."
        : undefined
    );

    /* Queue */
    if (G.Q < 500) add("queue", "Longueur de queue", `${mm(G.Q)} — minimum usuel 500 mm`, "BLOQUANT", "Stabilité du vantail non assurée.");
    else if (G.Q < G.PL * 0.3)
      add("queue", "Longueur de queue", `${mm(G.Q)} soit ${Math.round((G.Q / G.PL) * 100)} % du passage`, "A_CONFIRMER", "Queue courte : vérifier la stabilité en position ouverte.");
    else add("queue", "Longueur de queue", mm(G.Q), "VALIDE");

    /* Refoulement */
    if (G.refDispo <= 0) add("ref", "Refoulement disponible", "non renseigné", "BLOQUANT", "Cote indispensable à la validation de la géométrie.");
    else if (G.refDispo < G.refNecessaire)
      add("ref", "Refoulement disponible", `${mm(G.refDispo)} pour ${mm(G.refNecessaire)} nécessaires`, "BLOQUANT", `Manque ${mm(G.refNecessaire - G.refDispo)}. Réduire la queue ou revoir l'implantation.`);
    else add("ref", "Refoulement disponible", `${mm(G.refDispo)} ≥ ${mm(G.refNecessaire)} nécessaires`, "VALIDE");

    /* Gamme / section de poutre */
    const limite: Record<string, number> = { "LEO 100": 4500, "LEO 120": 6500, "LEO 150": 8500, autre: 99999 };
    const lim = limite[S("gamme")] ?? 6500;
    if (G.L > lim * 1.15)
      add("gamme", "Section de poutre basse / longueur", `${S("gamme")} — ${mm(G.L)} pour ${mm(lim)} indicatifs`, "BLOQUANT", "Section nettement insuffisante : passer à la gamme supérieure.");
    else if (G.L > lim)
      add("gamme", "Section de poutre basse / longueur", `${S("gamme")} — ${mm(G.L)} pour ${mm(lim)} indicatifs`, "A_CONFIRMER", "Vérifier la flèche : gamme supérieure conseillée.");
    else add("gamme", "Section de poutre basse / longueur", `${S("gamme")} — ${mm(G.L)} (limite indicative ${mm(lim)})`, "CALCULE");

    /* Remplissage */
    if (G.type === "barreaux-v" || G.type === "mixte") {
      const ok = G.rep.jeu <= N("entraxeMax") + 0.5;
      add(
        "barreaux",
        "Répartition du barreaudage",
        `${G.rep.nb} barreaux/travée — jeu libre ${mm(G.rep.jeu)} — entraxe ${mm(G.rep.entraxe)}`,
        ok ? "CALCULE" : "A_CONFIRMER",
        ok ? undefined : "Jeu libre supérieur à la valeur demandée."
      );
    } else if (G.type === "barreaux-h") {
      add("barreaux", "Répartition du barreaudage", `${G.repH.nb} barreaux/travée — jeu libre ${mm(G.repH.jeu)} — entraxe ${mm(G.repH.entraxe)}`, "CALCULE");
    } else {
      add("barreaux", "Remplissage", `${G.surfaceTole > 0 ? arrondi(G.surfaceTole, 2) + " m² de tôle" : "—"}`, "CALCULE");
    }

    /* Travées */
    add("travees", "Travées", `${G.nTrav} travée(s) de ${mm(G.largTravee)} libre`, G.largTravee > 2500 ? "A_CONFIRMER" : "CALCULE", G.largTravee > 2500 ? "Travée large : ajouter un montant intermédiaire." : undefined);

    /* Roues */
    add(
      "roues",
      "Position des roues",
      `axe arrière à ${mm(G.d1)} de l'extrémité queue — entraxe ${mm(G.ent)} — axe avant à ${mm(G.d2)} de l'extrémité avant`,
      S("positionRoues") === "auto" ? "CALCULE" : G.ent < G.L * 0.3 ? "A_CONFIRMER" : "CALCULE",
      S("positionRoues") === "auto"
        ? `Automatique : ${mm(offsetRouesAuto(G.L))} de chaque bord (vantail ${mm(G.L)}).`
        : G.ent < G.L * 0.3
          ? "Entraxe faible : stabilité à vérifier en position ouverte."
          : undefined
    );
    add(
      "encast",
      "Encastrement des roues dans la poutre basse",
      `${Math.round(G.encastrement)} % (Ø ${G.D} mm dans poutre ${G.pb.h} mm)`,
      G.encastrement < 50 || G.encastrement > 95 ? "A_CONFIRMER" : "CALCULE",
      G.encastrement < 50 ? "Encastrement faible : vérifier la garde au sol et la hauteur de rail." : undefined
    );

    /* Charge */
    const capacite = 2 * 400;
    add(
      "poids",
      "Poids estimatif du vantail",
      `${Math.round(G.poidsTotal)} kg pour ${capacite} kg de capacité indicative (2 roues)`,
      G.poidsTotal > capacite * 0.85 ? "A_CONFIRMER" : "CALCULE",
      G.poidsTotal > capacite * 0.85 ? "Vérifier la capacité réelle des roues auprès du fournisseur." : "Valeur indicative, hors accessoires et motorisation."
    );

    /* Prise au vent */
    add(
      "vent",
      "Surface et occultation",
      `${arrondi(G.surfaceOuvrage, 2)} m² — occultation ${Math.round(G.occultation * 100)} %`,
      G.occultation > 0.8 && G.surfaceOuvrage > 8 ? "A_CONFIRMER" : "CALCULE",
      G.occultation > 0.8 && G.surfaceOuvrage > 8 ? "Forte prise au vent : renforts et fixations à valider." : undefined
    );

    /* Garde au sol / rail */
    const jeuRail = G.GS - G.railH;
    if (jeuRail <= 0)
      add("rail", "Jeu au-dessus du rail", `${mm(jeuRail)} — la poutre basse touche le rail`, "BLOQUANT", "Augmenter la garde au sol ou encastrer le rail.");
    else add("rail", "Jeu au-dessus du rail", `${mm(jeuRail)} (garde au sol ${mm(G.GS)} − rail ${mm(G.railH)})`, "CALCULE");

    if (S("rail") === "aucun") add("typerail", "Type de rail", "non défini", "A_CONFIRMER", "Rail, support et longrine à définir.");

    /* Motorisation */
    if (S("motorisation") === "motorise" && !S("modeleMoteur").trim())
      add("moteur", "Motorisation", "demandée, modèle non défini", "BLOQUANT", "Modèle, poids admissible et support moteur à préciser.");
    else if (S("motorisation") === "motorise")
      add("moteur", "Motorisation", `${S("modeleMoteur")} — crémaillère : ${S("cremaillere")}`, "A_CONFIRMER", "Conformité EN 13241 à contrôler (essais et notices).");

    /* Cotes de site */
    if (S("cotesFinies") !== "oui")
      add("site", "Cotes finies après maçonnerie et sol fini", "non confirmées", "A_CONFIRMER", "Relevé à confirmer avant lancement du débit.");
    else add("site", "Cotes finies après maçonnerie et sol fini", "confirmées", "VALIDE");

    /* Identification */
    if (!S("client").trim() || !S("reference").trim())
      add("ident", "Identification du projet", "client ou référence manquant", "A_CONFIRMER");
    else add("ident", "Identification du projet", `${S("client")} — ${S("reference")}`, "VALIDE");

    return c;
  }, [G, S, N]);

  const nbBloquant = controles.filter((c) => c.etat === "BLOQUANT").length;
  const nbAConfirmer = controles.filter((c) => c.etat === "A_CONFIRMER").length;
  const statutDossier =
    nbBloquant > 0 ? "DOSSIER BLOQUÉ" : nbAConfirmer > 0 ? "DOSSIER EN ATTENTE D'INFORMATIONS" : "DOSSIER EN ATTENTE DE VALIDATION";

  /* ==========================================================================
     6.3 DESSIN SVG
  ========================================================================== */
  const ralHex = (RALS.find((r) => r.v === S("ral")) || RALS[0]).hex;
  const realiste = S("rendu") === "realiste";

  const dessin = useMemo(() => {
    const flip = (S("refoulement") === "droite") !== (S("vue") === "interieure");
    const largSup = Math.max(40, S("support") === "piliers" ? N("largeurSupport") : G.pot.h);
    const hPoteau = Math.max(300, G.hPoteau);

    /* Étendue du modèle */
    const xModMin = Math.min(-G.Q, -G.refDispo, 0) - largSup - 200;
    const xModMax = G.PL + Math.max(G.REC, largSup) + 200;

    const MX = (x: number) => (flip ? G.PL - x : x);
    const a = MX(xModMin);
    const b = MX(xModMax);
    const xScrMin = Math.min(a, b);
    const xScrMax = Math.max(a, b);

    const portee = xScrMax - xScrMin;
    const FS = Math.max(70, Math.min(200, portee / 62)); // taille de texte
    const MG = FS * 9.2; // marge gauche
    const MD = FS * 9.2; // marge droite
    const MH = FS * 4; // marge haute (titre)
    const MB_COTES = FS * 13.2;
    const H_CART = S("cartouche") === "oui" ? FS * 6.4 : 0;

    const hMax = Math.max(G.yHaut, hPoteau) + 100;
    const W = portee + MG + MD;
    const HH = MH + hMax + MB_COTES + H_CART;

    const SX = (x: number) => MG + (MX(x) - xScrMin);
    const SY = (y: number) => MH + hMax - y;

    const TR = Math.max(4, W / 1100); // épaisseur de trait
    const TRF = TR * 1.8; // trait fort
    const dirOut = flip ? -1 : 1; // direction « vers l'extérieur » côté réception

    const remp = realiste ? ralHex : "#EAEEF3";
    const trait = realiste ? "#101214" : ACIER;
    const rempClair = realiste ? ralHex : "#F4F6F9";

    const els: React.ReactElement[] = [];
    let k = 0;
    const key = () => `e${k++}`;

    const R = (x1: number, y1: number, x2: number, y2: number, props: Record<string, unknown>) => {
      const sx1 = SX(x1);
      const sx2 = SX(x2);
      const sy1 = SY(y1);
      const sy2 = SY(y2);
      els.push(
        <rect
          key={key()}
          x={Math.min(sx1, sx2)}
          y={Math.min(sy1, sy2)}
          width={Math.abs(sx2 - sx1)}
          height={Math.abs(sy2 - sy1)}
          {...props}
        />
      );
    };

    const profil = { fill: remp, stroke: trait, strokeWidth: TRF, strokeLinejoin: "round" as const };
    const profilLeger = { fill: rempClair, stroke: trait, strokeWidth: TR };

    /* ---------- Sol ---------- */
    els.push(
      <line key={key()} x1={0} y1={SY(0)} x2={W} y2={SY(0)} stroke={ACIER} strokeWidth={TRF} />
    );
    for (let x = 0; x < W; x += 120) {
      els.push(
        <line key={key()} x1={x} y1={SY(0)} x2={x - 70} y2={SY(0) + 70} stroke={GRIS} strokeWidth={TR * 0.8} />
      );
    }

    /* ---------- Rail ---------- */
    if (S("rail") !== "aucun") {
      const xR1 = Math.min(-G.refDispo, -G.Q - 100);
      const xR2 = G.PL;
      R(xR1, 0, xR2, G.railH, { fill: "#C9CFD7", stroke: trait, strokeWidth: TR, rx: G.railH / 2 });
      if (S("butees") === "oui") {
        R(xR1 + 60, 0, xR1 + 160, G.railH + 90, profilLeger);
        R(G.PL - 260, 0, G.PL - 160, G.railH + 90, profilLeger);
      }
    }

    /* ---------- Vantail en position ouverte (fantôme) ---------- */
    if (S("fantome") === "oui") {
      R(-G.L, G.yBas, 0, G.yHaut, {
        fill: BLEU,
        fillOpacity: 0.04,
        stroke: BLEU,
        strokeWidth: TR,
        strokeDasharray: `${TR * 7} ${TR * 6}`,
        opacity: 0.85,
      });
      els.push(
        <text
          key={key()}
          x={(SX(-G.L) + SX(0)) / 2}
          y={SY(G.yHaut) - FS * 0.45}
          fontSize={FS * 0.72}
          fill={BLEU}
          opacity={0.9}
          textAnchor="middle"
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight={600}
        >
          VANTAIL EN POSITION OUVERTE
        </text>
      );
    }

    /* ---------- Supports (poteaux ou piliers) ---------- */
    const dessinerSupport = (x1: number, x2: number, h: number) => {
      if (S("support") === "piliers") {
        R(x1, 0, x2, h, { fill: "#E4E2DD", stroke: GRIS, strokeWidth: TR });
        const sx1 = Math.min(SX(x1), SX(x2));
        const sx2 = Math.max(SX(x1), SX(x2));
        for (let yy = 0; yy < h; yy += 220) {
          els.push(
            <line key={key()} x1={sx1} y1={SY(yy)} x2={sx2} y2={SY(yy)} stroke="#C9C6C0" strokeWidth={TR * 0.7} />
          );
        }
      } else {
        R(x1, 0, x2, h, profilLeger);
        R(x1 - 25, h, x2 + 25, h + 45, profilLeger); // chapeau plat
      }
    };

    if (S("poteauGuidage") === "oui") dessinerSupport(-largSup, 0, hPoteau);
    if (S("poteauReception") === "oui") dessinerSupport(G.PL, G.PL + largSup, hPoteau);

    /* ---------- Moteur ---------- */
    if (S("motorisation") === "motorise") {
      R(-G.Q - 520, 0, -G.Q - 120, 420, profilLeger);
    }

    /* ---------- Vantail : poutre basse ---------- */
    R(-G.Q, G.yBas, G.xAv, G.yBas + G.Hp, profil);

    /* ---------- Traverse haute ---------- */
    R(G.xTrav, G.yHaut - G.Sc, G.xAv, G.yHaut, profil);

    /* ---------- Montants ---------- */
    G.montants.forEach((xm) => {
      R(xm, G.yBas + G.Hp, xm + G.Sc, G.yHaut - G.Sc, profil);
    });

    /* ---------- Remplissage par travée ---------- */
    const traveeX: number[] = [];
    for (let i = 0; i < G.nTrav; i++) {
      traveeX.push(G.xArr + G.Sc + i * (G.largTravee + G.Sc));
    }

    const patternPerf = "url(#mdsPerf)";

    traveeX.forEach((x0) => {
      const x1 = x0 + G.largTravee;
      if (G.type === "barreaux-v") {
        for (let i = 0; i < G.rep.nb; i++) {
          const bx = x0 + G.rep.jeu + i * G.rep.entraxe;
          R(bx, G.yRempBas, bx + G.Lb, G.yRempHaut, { fill: remp, stroke: trait, strokeWidth: TR });
        }
      } else if (G.type === "barreaux-h") {
        for (let i = 0; i < G.repH.nb; i++) {
          const by = G.yRempBas + G.repH.jeu + i * G.repH.entraxe;
          R(x0, by, x1, by + G.Lb, { fill: remp, stroke: trait, strokeWidth: TR });
        }
      } else if (G.type === "lames-h") {
        for (let i = 0; i < G.repLames.nb; i++) {
          const by = G.yRempBas + G.repLames.jeu + i * G.repLames.entraxe;
          R(x0, by, x1, by + 100, { fill: remp, stroke: trait, strokeWidth: TR });
        }
      } else if (G.type === "tole") {
        R(x0, G.yRempBas, x1, G.yRempHaut, { fill: remp, stroke: trait, strokeWidth: TR });
      } else if (G.type === "microperfore") {
        R(x0, G.yRempBas, x1, G.yRempHaut, { fill: remp, stroke: trait, strokeWidth: TR });
        R(x0, G.yRempBas, x1, G.yRempHaut, { fill: patternPerf, stroke: "none" });
      } else if (G.type === "mixte") {
        R(x0, G.yRempBas, x1, G.yRempBas + G.soub, { fill: remp, stroke: trait, strokeWidth: TR });
        R(x0, G.yRempBas + G.soub, x1, G.yRempBas + G.soub + G.Sc, profil);
        const yb0 = G.yRempBas + G.soub + G.Sc;
        for (let i = 0; i < G.rep.nb; i++) {
          const bx = x0 + G.rep.jeu + i * G.rep.entraxe;
          R(bx, yb0, bx + G.Lb, G.yRempHaut, { fill: remp, stroke: trait, strokeWidth: TR });
        }
      }
    });

    /* ---------- Queue non remplie : diagonale de contreventement ---------- */
    if (G.cfg === "prolongee" && G.Q > 0) {
      els.push(
        <line
          key={key()}
          x1={SX(G.xTrav + G.Sc)}
          y1={SY(G.yHaut - G.Sc)}
          x2={SX(0)}
          y2={SY(G.yBas + G.Hp)}
          stroke={trait}
          strokeWidth={TR}
          strokeDasharray={`${TR * 6} ${TR * 5}`}
        />
      );
    }

    /* ---------- Crémaillère ---------- */
    if (S("motorisation") === "motorise" && S("cremaillere") === "oui") {
      const yC = G.yBas + G.Hp * 0.25;
      els.push(
        <line
          key={key()}
          x1={SX(-G.Q + 100)}
          y1={SY(yC)}
          x2={SX(G.PL)}
          y2={SY(yC)}
          stroke={trait}
          strokeWidth={TR * 2}
          strokeDasharray={`${TR * 3} ${TR * 3}`}
        />
      );
    }

    /* ---------- Roues (partie cachée en pointillés) ---------- */
    const roue = (xc: number) => {
      const cx = SX(xc);
      const cy = SY(G.yAxeRoue);
      const rr = (SX(G.R) - SX(0)) * (flip ? -1 : 1);
      const r = Math.abs(rr);
      els.push(
        <g key={key()}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={trait} strokeWidth={TR} strokeDasharray={`${TR * 5} ${TR * 4}`} opacity={0.75} clipPath="url(#mdsClipHaut)" />
          <circle cx={cx} cy={cy} r={r} fill="#FFFFFF" stroke={trait} strokeWidth={TRF} clipPath="url(#mdsClipBas)" />
          <line x1={cx - r * 0.35} y1={cy} x2={cx + r * 0.35} y2={cy} stroke={BLEU} strokeWidth={TR} />
          <line x1={cx} y1={cy - r * 0.35} x2={cx} y2={cy + r * 0.35} stroke={BLEU} strokeWidth={TR} />
        </g>
      );
    };
    roue(G.xRoue1);
    roue(G.xRoue2);

    /* ---------- Galets de guidage ---------- */
    if (S("guidage") !== "aucun" && S("poteauGuidage") === "oui") {
      const nG = Math.max(1, N("nbGalets"));
      const yG = Math.min(hPoteau - 90, G.yHaut - G.Sc / 2);
      for (let i = 0; i < nG; i++) {
        const xg = -largSup / 2 + (i - (nG - 1) / 2) * (largSup * 0.55);
        els.push(
          <circle key={key()} cx={SX(xg)} cy={SY(yG)} r={Math.abs(SX(45) - SX(0))} fill="#FFFFFF" stroke={trait} strokeWidth={TR} />
        );
      }
    }

    /* ---------- Profil de réception ---------- */
    if (S("poteauReception") === "oui" && S("profilReception") !== "aucun") {
      const xU = G.PL;
      R(xU, G.yBas, xU + 90, G.yHaut, { fill: "none", stroke: trait, strokeWidth: TRF });
    }

    /* ---------- Parties cachées des supports (traits interrompus) ---------- */
    const cache = { fill: "none", stroke: trait, strokeWidth: TR * 0.9, strokeDasharray: `${TR * 6} ${TR * 5}`, opacity: 0.55 };
    if (S("poteauGuidage") === "oui") R(-largSup, G.yBas, 0, Math.min(hPoteau, G.yHaut), cache);
    if (S("poteauReception") === "oui" && G.REC > 0) R(G.PL, G.yBas, G.PL + largSup, Math.min(hPoteau, G.yHaut), cache);

    /* ---------- COTES ---------- */
    const cotes: React.ReactElement[] = [];
    let ck = 0;
    const ckey = () => `c${ck++}`;
    const fleche = (x: number, y: number, dir: number) => (
      <path key={ckey()} d={`M${x},${y} L${x + dir * FS * 0.8},${y - FS * 0.28} L${x + dir * FS * 0.8},${y + FS * 0.28} Z`} fill={BLEU} />
    );

    const texteCote = (x: number, y: number, t: string, ancre: "start" | "middle" | "end", rot?: number) =>
      cotes.push(
        <text
          key={ckey()}
          x={x}
          y={y}
          fontSize={FS}
          fill={BLEU}
          textAnchor={ancre}
          fontFamily="Arial, Helvetica, sans-serif"
          fontWeight={600}
          transform={rot !== undefined ? `rotate(${rot} ${x} ${y})` : undefined}
        >
          {t}
        </text>
      );

    const coteH = (xa: number, xb: number, yLigne: number, texte: string, yObjet?: number) => {
      const x1 = Math.min(SX(xa), SX(xb));
      const x2 = Math.max(SX(xa), SX(xb));
      const y = SY(yLigne);
      const court = x2 - x1 < texte.length * FS * 0.56;
      cotes.push(<line key={ckey()} x1={court ? x1 - FS : x1} y1={y} x2={court ? x2 + FS : x2} y2={y} stroke={BLEU} strokeWidth={TR} />);
      if (yObjet !== undefined) {
        cotes.push(<line key={ckey()} x1={x1} y1={SY(yObjet)} x2={x1} y2={y + FS * 0.4} stroke={BLEU} strokeWidth={TR * 0.7} opacity={0.55} />);
        cotes.push(<line key={ckey()} x1={x2} y1={SY(yObjet)} x2={x2} y2={y + FS * 0.4} stroke={BLEU} strokeWidth={TR * 0.7} opacity={0.55} />);
      } else {
        cotes.push(<line key={ckey()} x1={x1} y1={y - FS * 0.45} x2={x1} y2={y + FS * 0.45} stroke={BLEU} strokeWidth={TR} />);
        cotes.push(<line key={ckey()} x1={x2} y1={y - FS * 0.45} x2={x2} y2={y + FS * 0.45} stroke={BLEU} strokeWidth={TR} />);
      }
      cotes.push(fleche(x1, y, court ? -1 : 1));
      cotes.push(fleche(x2, y, court ? 1 : -1));
      if (court) {
        const besoin = texte.length * FS * 0.56;
        if (x2 + FS * 1.5 + besoin < W - FS * 0.5) texteCote(x2 + FS * 1.5, y + FS * 0.34, texte, "start");
        else texteCote(x1 - FS * 1.5, y + FS * 0.34, texte, "end");
      } else texteCote((x1 + x2) / 2, y - FS * 0.4, texte, "middle");
    };

    const coteV = (ya: number, yb: number, x: number, texte: string, cote: number, xObjet?: number) => {
      const y1 = Math.min(SY(ya), SY(yb));
      const y2 = Math.max(SY(ya), SY(yb));
      if (xObjet !== undefined) {
        cotes.push(<line key={ckey()} x1={xObjet} y1={y1} x2={x + cote * FS * 0.4} y2={y1} stroke={BLEU} strokeWidth={TR * 0.7} opacity={0.55} />);
        cotes.push(<line key={ckey()} x1={xObjet} y1={y2} x2={x + cote * FS * 0.4} y2={y2} stroke={BLEU} strokeWidth={TR * 0.7} opacity={0.55} />);
      }
      const court = y2 - y1 < texte.length * FS * 0.56;
      cotes.push(<line key={ckey()} x1={x} y1={court ? y1 - FS : y1} x2={x} y2={court ? y2 + FS : y2} stroke={BLEU} strokeWidth={TR} />);
      cotes.push(<line key={ckey()} x1={x - FS * 0.45} y1={y1} x2={x + FS * 0.45} y2={y1} stroke={BLEU} strokeWidth={TR} />);
      cotes.push(<line key={ckey()} x1={x - FS * 0.45} y1={y2} x2={x + FS * 0.45} y2={y2} stroke={BLEU} strokeWidth={TR} />);
      const tx = x + cote * FS * 0.42;
      if (court) texteCote(tx, y2 + FS * 1.6, texte, "start", -90);
      else texteCote(tx, (y1 + y2) / 2, texte, "middle", -90);
    };

    if (S("cotes") === "oui") {
      if (S("cotesRoues") === "oui") {
        coteH(-G.Q, G.xRoue1, -FS * 1.8, mm(G.d1));
        const largeEnt = Math.abs(SX(G.xRoue2) - SX(G.xRoue1)) > FS * 13;
        coteH(G.xRoue1, G.xRoue2, -FS * 1.8, largeEnt ? `Entraxe roues ${mm(G.ent)}` : mm(G.ent));
        coteH(G.xRoue2, G.xAv, -FS * 1.8, mm(G.d2));
      }
      coteH(-G.Q, 0, -FS * 5, `Queue ${mm(G.Q)}`, G.yBas);
      coteH(0, G.PL, -FS * 5, `Passage libre ${mm(G.PL)}`, 0);
      if (G.REC > 0) coteH(G.PL, G.xAv, -FS * 8.2, `Rec. ${mm(G.REC)}`, G.yBas);
      coteH(-G.Q, G.xAv, -FS * 8.2, `Vantail total ${mm(G.L)}`, G.yBas);
      if (G.refDispo > 0) coteH(-G.refDispo, 0, -FS * 11.4, `Refoulement disponible ${mm(G.refDispo)}`, 0);

      /* Cotes verticales, placées à l'extérieur, côté réception */
      const x0 = SX(G.PL + largSup);
      const xc1 = x0 + dirOut * FS * 1.4;
      const xc2 = x0 + dirOut * FS * 3.6;
      const xc3 = x0 + dirOut * FS * 5.8;
      const xObj = SX(G.xAv);
      coteV(0, G.GS, xc1, `Garde au sol ${mm(G.GS)}`, dirOut, xObj);
      coteV(G.yBas, G.yHaut, xc2, `Hauteur ouvrage ${mm(G.H)}`, dirOut, xObj);
      coteV(0, G.yHaut, xc3, `Hors tout ${mm(G.HT)}`, dirOut, xObj);
    }

    /* ---------- Titre de vue ---------- */
    const titreVue = `VUE ${S("vue") === "exterieure" ? "EXTÉRIEURE" : "INTÉRIEURE"} — POSITION FERMÉE — REFOULEMENT À ${
      S("refoulement") === "gauche" ? "GAUCHE" : "DROITE"
    } (vu de l'extérieur)`;

    /* ---------- Cartouche ---------- */
    const cart: React.ReactElement[] = [];
    if (S("cartouche") === "oui") {
      const yC = HH - H_CART;
      const hL = H_CART - 160;
      cart.push(<rect key="cb" x={0} y={yC} width={W} height={H_CART} fill="#FFFFFF" stroke={ACIER} strokeWidth={TRF} />);
      cart.push(<line key="cl" x1={0} y1={yC} x2={W} y2={yC} stroke={ACIER} strokeWidth={TRF} />);

      /* Logo, entièrement visible en bas à gauche, sur fond blanc, avec marge */
      const lx = 80;
      const ly = yC + 80;
      const lw = Math.min(W * 0.2, 2200);
      const lh = hL;
      cart.push(<rect key="lf" x={lx} y={ly} width={lw} height={lh} fill="#FFFFFF" />);
      if (S("logoOfficiel") === "oui") {
        cart.push(
          <image key="lg" href="/logo-mds.png" x={lx} y={ly} width={lw} height={lh} preserveAspectRatio="xMinYMid meet" />
        );
      } else {
        const ms = Math.min(lh * 0.58, lw * 0.26);
        const tx = lx + ms * 1.85;
        const dispoTxt = Math.max(120, lw - (tx - lx) - 20);
        const fsTxt = Math.min(lh * 0.2, dispoTxt / 8.8);
        cart.push(
          <g key="lg">
            <text x={lx + 10} y={ly + lh * 0.64} fontSize={ms} fontFamily="Arial Black, Arial, sans-serif" fontWeight={900} fill={ACIER} letterSpacing={-ms * 0.06}>
              MS
            </text>
            <path
              d={`M${lx + 6},${ly + lh * 0.76} L${lx + ms * 1.5},${ly + lh * 0.24}`}
              stroke={BLEU}
              strokeWidth={ms * 0.13}
              strokeLinecap="round"
              fill="none"
            />
            <text x={tx} y={ly + lh * 0.46} fontSize={fsTxt} fontFamily="Arial, Helvetica, sans-serif" fontWeight={700} fill={ACIER} letterSpacing={fsTxt * 0.08}>
              LA MÉTALLERIE
            </text>
            <text x={tx} y={ly + lh * 0.8} fontSize={fsTxt * 1.15} fontFamily="Arial, Helvetica, sans-serif" fontWeight={800} fill={BLEU} letterSpacing={fsTxt * 0.08}>
              DU SUD
            </text>
          </g>
        );
      }

      /* Champs du cartouche, à droite du logo */
      const colX = lx + lw + FS * 2.6;
      cart.push(
        <line key="csep" x1={colX - FS * 1.3} y1={yC + 60} x2={colX - FS * 1.3} y2={yC + H_CART - 60} stroke={LIGNE} strokeWidth={TR} />
      );
      const dispo = W - colX - 80;
      const nCol = 4;
      const cw = dispo / nCol;
      const champs: string[][] = [
        ["CLIENT", S("client") || "—"],
        ["RÉFÉRENCE", S("reference") || "—"],
        ["DEVIS", S("devis") || "—"],
        ["DATE", S("date") || "—"],
        ["OUVRAGE", `Portail coulissant ${S("gamme")}`],
        ["FINITION", `RAL ${S("ral")} ${S("aspect")}`],
        ["INDICE", S("indice")],
        ["DESSINATEUR", S("dessinateur")],
      ];
      champs.forEach((c, i) => {
        const col = i % nCol;
        const row = Math.floor(i / nCol);
        const cx = colX + col * cw;
        const cy = ly + 40 + row * (hL / 2.2);
        cart.push(
          <text key={`ct${i}`} x={cx} y={cy} fontSize={FS * 0.62} fill={GRIS} fontFamily="Arial, Helvetica, sans-serif">
            {c[0]}
          </text>
        );
        cart.push(
          <text key={`cv${i}`} x={cx} y={cy + FS * 0.95} fontSize={FS * 0.82} fill={ACIER} fontWeight={700} fontFamily="Arial, Helvetica, sans-serif">
            {c[1]}
          </text>
        );
      });
      cart.push(
        <text key="cm" x={W - 80} y={yC + H_CART - 40} fontSize={FS * 0.62} fill="#B3261E" textAnchor="end" fontFamily="Arial, Helvetica, sans-serif" fontWeight={700}>
          NE PAS MESURER DIRECTEMENT SUR LE PLAN — COTES EN MILLIMÈTRES
        </text>
      );
      cart.push(
        <text key="cs" x={colX} y={yC + H_CART - 40} fontSize={FS * 0.62} fill={BLEU} fontFamily="Arial, Helvetica, sans-serif" fontWeight={700}>
          {S("statutDoc")} — DÉLAI : {S("delai")}
        </text>
      );
    }

    return (
      <svg viewBox={`0 0 ${W} ${HH}`} width="100%" height="100%" style={{ display: "block" }} id="plan-leo-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <clipPath id="mdsClipBas">
            <rect x={0} y={SY(G.yBas)} width={W} height={HH} />
          </clipPath>
          <clipPath id="mdsClipHaut">
            <rect x={0} y={0} width={W} height={SY(G.yBas)} />
          </clipPath>
          <pattern id="mdsPerf" width={70} height={70} patternUnits="userSpaceOnUse">
            <circle cx={35} cy={35} r={16} fill="#FFFFFF" opacity={0.8} />
          </pattern>
        </defs>

        <rect x={0} y={0} width={W} height={HH} fill="#FFFFFF" />
        <text x={MG} y={MH - FS * 0.8} fontSize={FS * 0.95} fill={ACIER} fontWeight={700} fontFamily="Arial, Helvetica, sans-serif">
          {titreVue}
        </text>

        {els}
        {cotes}
        {cart}
      </svg>
    );
  }, [G, ralHex, realiste, S, N]);

  /* ==========================================================================
     6.4 EXPORTS
  ========================================================================== */
  const exporterSVG = () => {
    if (typeof document === "undefined") return;
    const s = svgDuPlan();
    if (!s) return;
    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + s], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Plan_${S("client") || "client"}_${S("reference") || "ref"}_${S("gamme").replace(/\s/g, "")}_Indice${S("indice")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chantiersLies = matchByClientNom(snapshot.chantiers, S("client"));
  const chantierOuvert = lienChantierId
    ? snapshot.chantiers.find((c) => c.id === lienChantierId)
    : chantiersLies[0];

  async function enregistrerOneDrive() {
    setSaveBusy(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/plan-leo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: p,
          svg: svgDuPlan(),
          chantierId: chantierOuvert?.id ?? lienChantierId,
        }),
      });
      const data = (await res.json()) as {
        id?: string;
        folder?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible.");
      setPlanId(data.id ?? planId);
      setSaveMsg(
        `Enregistré dans le dossier OneDrive « ${data.folder} » (JSON + SVG).`,
      );
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaveBusy(false);
    }
  };

  /* ==========================================================================
     6.5 RENDU
  ========================================================================== */
  const tonStatut =
    nbBloquant > 0
      ? "border-red-300 bg-red-100 text-red-900"
      : nbAConfirmer > 0
        ? "border-amber-300 bg-amber-100 text-amber-950"
        : "border-emerald-300 bg-emerald-100 text-emerald-900";
  const bouton =
    "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:border-stone-400 hover:text-stone-900";

  return (
    <section className="space-y-6">
      <style>{CSS_IMPRESSION}</style>

      <div className="plan-no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Plan — Portail coulissant</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Gamme LEO. Renseigne les options dans le panneau, le plan se dessine en direct et les
            contrôles techniques se mettent à jour à chaque choix.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tonStatut}`}>
            {statutDossier}
          </span>
          <button
            type="button"
            disabled={saveBusy}
            className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-800 disabled:opacity-60"
            onClick={() => void enregistrerOneDrive()}
          >
            {saveBusy ? "Enregistrement…" : "Enregistrer sur OneDrive"}
          </button>
          <button type="button" className={bouton} onClick={exporterSVG}>
            Exporter SVG
          </button>
          <button
            type="button"
            className={bouton}
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
          >
            Imprimer / PDF
          </button>
          <button
            type="button"
            className={bouton}
            onClick={() => setP({ ...DEFAUTS, date: new Date().toLocaleDateString("fr-FR") })}
          >
            Réinitialiser
          </button>
        </div>
      </div>
      <p className="plan-no-print -mt-2 max-w-3xl text-xs text-stone-500">
        Enregistrer sur OneDrive copie le JSON et le SVG dans le dossier du client (même nom
        que le chantier, sans en créer un second). Le badge décrit seulement les contrôles
        techniques.
      </p>
      {saveErr ? <FormNotice className="plan-no-print">{saveErr}</FormNotice> : null}
      {saveMsg ? (
        <p className="plan-no-print rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {saveMsg}
        </p>
      ) : null}
      {chantierOuvert ? (
        <p className="plan-no-print text-sm text-stone-700">
          Lié au chantier{" "}
          <Link
            href={`/chantiers?fiche=${encodeURIComponent(chantierOuvert.id)}`}
            className="font-medium underline"
          >
            {chantierOuvert.nom_client}
          </Link>
          {chantiersLies.length > 1 ? ` · ${chantiersLies.length} homonymes` : ""}
        </p>
      ) : S("client").trim() ? (
        <p className="plan-no-print text-sm text-stone-500">
          Aucun chantier avec ce nom pour l’instant — le dossier OneDrive portera quand même ce
          nom.
        </p>
      ) : null}

      <PlanOuvrageTabs current="portail-leo" />

      <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="plan-no-print space-y-2">
          <Bloc titre="1. Projet et livrable" ouvert={ouverts.projet} onToggle={() => bascule("projet")}>
            <Ligne label="Client">
              <Texte
                value={S("client")}
                onChange={(v) => set("client", v)}
                placeholder="Nom du client (= nom du chantier)"
                list="plan-leo-chantiers"
              />
              <datalist id="plan-leo-chantiers">
                {snapshot.chantiers.map((c) => (
                  <option key={c.id} value={c.nom_client} />
                ))}
              </datalist>
            </Ligne>
            <Ligne label="Référence projet">
              <Texte value={S("reference")} onChange={(v) => set("reference", v)} placeholder="Ex. 2026-118" />
            </Ligne>
            <Ligne label="N° de devis">
              <Texte value={S("devis")} onChange={(v) => set("devis", v)} />
            </Ligne>
            <Ligne label="Type de document">
              <Deroulant
                value={S("statutDoc")}
                onChange={(v) => set("statutDoc", v)}
                options={opts([
                  ["PLAN DE PRINCIPE", "Plan de principe"],
                  ["PLAN CLIENT — POUR VALIDATION", "Plan client — pour validation"],
                  ["PLAN ATELIER", "Plan atelier"],
                  ["DOSSIER COMPLET", "Dossier complet"],
                ])}
              />
            </Ligne>
            <Ligne label="Indice de révision">
              <Deroulant value={S("indice")} onChange={(v) => set("indice", v)} options={opts([["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"], ["E", "E"]])} />
            </Ligne>
            <Ligne label="Délai">
              <Texte value={S("delai")} onChange={(v) => set("delai", v)} />
            </Ligne>
            <Ligne label="Dessinateur">
              <Texte value={S("dessinateur")} onChange={(v) => set("dessinateur", v)} />
            </Ligne>
          </Bloc>

          <Bloc titre="2. Vue et implantation" ouvert={ouverts.vue} onToggle={() => bascule("vue")}>
            <Ligne label="Vue affichée">
              <Deroulant value={S("vue")} onChange={(v) => set("vue", v)} options={opts([["exterieure", "Vue extérieure"], ["interieure", "Vue intérieure"]])} />
            </Ligne>
            <Ligne label="Sens de refoulement" aide="vu de l'extérieur">
              <Deroulant value={S("refoulement")} onChange={(v) => set("refoulement", v)} options={opts([["gauche", "Vers la gauche"], ["droite", "Vers la droite"]])} />
            </Ligne>
            <Ligne label="Position de pose">
              <Deroulant
                value={S("pose")}
                onChange={(v) => set("pose", v)}
                options={opts([["entre", "Entre piliers"], ["derriere", "Derrière piliers"], ["applique", "En applique"]])}
              />
            </Ligne>
            <Ligne label="Nature des supports">
              <Deroulant value={S("support")} onChange={(v) => set("support", v)} options={opts([["poteaux", "Poteaux acier fournis"], ["piliers", "Piliers maçonnés existants"]])} />
            </Ligne>
            <Ligne label="Largeur de pilier">
              <Nombre value={N("largeurSupport")} onChange={(v) => set("largeurSupport", v)} min={40} max={800} pas={10} unite="mm" disabled={S("support") !== "piliers"} presets={[150, 200, 250, 300, 400]} />
            </Ligne>
            <Ligne label="Cotes finies après maçonnerie">
              <Deroulant value={S("cotesFinies")} onChange={(v) => set("cotesFinies", v)} options={opts([["non", "Non confirmé"], ["oui", "Confirmé"]])} />
            </Ligne>
          </Bloc>

          <Bloc titre="3. Dimensions principales" ouvert={ouverts.dim} onToggle={() => bascule("dim")}>
            <Ligne label="Passage libre">
              <Nombre value={N("passageLibre")} onChange={(v) => set("passageLibre", v)} min={800} max={12000} pas={50} unite="mm" presets={[3000, 3500, 4000, 4500, 5000, 6000]} />
            </Ligne>
            <Ligne label="Hauteur de l'ouvrage" aide="dessous poutre → dessus cadre">
              <Nombre value={N("hauteurOuvrage")} onChange={(v) => set("hauteurOuvrage", v)} min={600} max={3000} pas={50} unite="mm" presets={[1400, 1500, 1600, 1700, 1800, 2000]} />
            </Ligne>
            <Ligne label="Garde au sol" aide="sol fini → dessous ouvrage">
              <Nombre value={N("gardeAuSol")} onChange={(v) => set("gardeAuSol", v)} min={0} max={200} pas={5} unite="mm" presets={[20, 30, 40, 50]} />
            </Ligne>
            <Ligne label="Longueur de queue" aide="au-delà du passage">
              <Nombre value={N("queue")} onChange={(v) => set("queue", v)} min={0} max={6000} pas={50} unite="mm" presets={[500, 1000, 1500, 2000, 2500]} />
            </Ligne>
            <Ligne label="Recouvrement en réception">
              <Nombre value={N("recouvrement")} onChange={(v) => set("recouvrement", v)} min={0} max={400} pas={5} unite="mm" presets={[0, 30, 50, 80, 100]} />
            </Ligne>
            <Ligne label="Jeu fermé dans la réception">
              <Nombre value={N("jeuFerme")} onChange={(v) => set("jeuFerme", v)} min={0} max={100} pas={5} unite="mm" presets={[10, 15, 20, 30]} />
            </Ligne>
            <Ligne label="Refoulement disponible">
              <Nombre value={N("refoulementDispo")} onChange={(v) => set("refoulementDispo", v)} min={0} max={20000} pas={50} unite="mm" presets={[4000, 5000, 6000, 7000, 8000]} />
            </Ligne>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Vantail total</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{mm(G.L)}</strong>
              </div>
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Hauteur hors tout</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{mm(G.HT)}</strong>
              </div>
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Refoulement nécessaire</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{mm(G.refNecessaire)}</strong>
              </div>
            </div>
          </Bloc>

          <Bloc titre="4. Gamme et ossature" ouvert={ouverts.ossature} onToggle={() => bascule("ossature")}>
            <Ligne label="Gamme">
              <Deroulant
                value={S("gamme")}
                onChange={(v) => {
                  set("gamme", v);
                  if (v === "LEO 100") set("poutreBasse", "100x50x3");
                  if (v === "LEO 120") set("poutreBasse", "120x60x3");
                  if (v === "LEO 150") set("poutreBasse", "150x60x4");
                }}
                options={opts([
                  ["LEO 100", "LEO 100 — poutre 100 mm"],
                  ["LEO 120", "LEO 120 — poutre 120 mm (standard)"],
                  ["LEO 150", "LEO 150 — poutre 150 mm"],
                  ["autre", "Autre — à valider"],
                ])}
              />
            </Ligne>
            <Ligne label="Poutre basse">
              <Deroulant value={S("poutreBasse")} onChange={(v) => set("poutreBasse", v)} options={SECTIONS_POUTRE} />
            </Ligne>
            <Ligne label="Cadre, montants et traverses">
              <Deroulant value={S("cadre")} onChange={(v) => set("cadre", v)} options={SECTIONS_CADRE} />
            </Ligne>
            <Ligne label="Configuration de la queue">
              <Deroulant
                value={S("configQueue")}
                onChange={(v) => set("configQueue", v)}
                options={opts([
                  ["remplie", "Complète et remplie"],
                  ["prolongee", "Prolongée en haut et en bas"],
                  ["poutre", "Poutre basse seule"],
                ])}
              />
            </Ligne>
            <Ligne label="Nombre de travées">
              <Deroulant
                value={S("nbTravees")}
                onChange={(v) => set("nbTravees", v)}
                options={opts([["auto", "Automatique"], ["1", "1 travée"], ["2", "2 travées"], ["3", "3 travées"], ["4", "4 travées"], ["5", "5 travées"]])}
              />
            </Ligne>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Travées</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">
                  {G.nTrav} × {mm(G.largTravee)}
                </strong>
              </div>
            </div>
          </Bloc>

          <Bloc titre="5. Remplissage" ouvert={ouverts.remplissage} onToggle={() => bascule("remplissage")}>
            <Ligne label="Type de remplissage">
              <Deroulant
                value={S("remplissage")}
                onChange={(v) => set("remplissage", v)}
                options={opts([
                  ["barreaux-v", "Barreaudage vertical"],
                  ["barreaux-h", "Barreaudage horizontal"],
                  ["tole", "Tôle pleine"],
                  ["microperfore", "Tôle microperforée"],
                  ["lames-h", "Lames horizontales"],
                  ["mixte", "Mixte — soubassement tôle + barreaux"],
                ])}
              />
            </Ligne>
            <Ligne label="Section des barreaux">
              <Deroulant value={S("sectionBarreau")} onChange={(v) => set("sectionBarreau", v)} options={SECTIONS_BARREAU} disabled={S("remplissage") === "tole" || S("remplissage") === "microperfore" || S("remplissage") === "lames-h"} />
            </Ligne>
            <Ligne label="Jeu libre maximal">
              <Deroulant
                value={String(N("entraxeMax"))}
                onChange={(v) => set("entraxeMax", parseFloat(v))}
                options={opts([["90", "90 mm"], ["100", "100 mm"], ["110", "110 mm (standard)"], ["120", "120 mm"], ["150", "150 mm"]])}
              />
            </Ligne>
            <Ligne label="Épaisseur de tôle">
              <Deroulant
                value={String(N("toleEp"))}
                onChange={(v) => set("toleEp", parseFloat(v))}
                options={opts([["1.5", "1,5 mm"], ["2", "2 mm (standard)"], ["3", "3 mm"]])}
                disabled={["barreaux-v", "barreaux-h"].indexOf(S("remplissage")) >= 0}
              />
            </Ligne>
            <Ligne label="Hauteur de soubassement">
              <Nombre value={N("soubassement")} onChange={(v) => set("soubassement", v)} min={100} max={1500} pas={50} unite="mm" disabled={S("remplissage") !== "mixte"} presets={[300, 400, 500, 600]} />
            </Ligne>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Barreaux</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{G.nbBarreauxTotal}</strong>
              </div>
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Jeu libre réel</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{mm(S("remplissage") === "barreaux-h" ? G.repH.jeu : G.rep.jeu)}</strong>
              </div>
              <div className="flex min-w-[92px] flex-col">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">Entraxe</span>
                <strong className="text-sm font-semibold tabular-nums text-stone-900">{mm(S("remplissage") === "barreaux-h" ? G.repH.entraxe : G.rep.entraxe)}</strong>
              </div>
            </div>
          </Bloc>

          <Bloc titre="6. Roulement, rail et guidage" ouvert={ouverts.roulement} onToggle={() => bascule("roulement")}>
            <Ligne label="Roues">
              <Deroulant
                value={S("roueModele")}
                onChange={(v) => set("roueModele", v)}
                options={opts([
                  ["GO Rolling Center — gorge V", "GO Rolling Center — gorge V"],
                  ["Roue à gorge V standard", "Roue à gorge V standard"],
                  ["Roue à gorge ronde", "Roue à gorge ronde"],
                  ["Chariot 4 galets", "Chariot 4 galets"],
                ])}
              />
            </Ligne>
            <Ligne label="Diamètre des roues">
              <Deroulant
                value={String(N("roueDiam"))}
                onChange={(v) => set("roueDiam", parseFloat(v))}
                options={opts([["100", "Ø 100 mm"], ["120", "Ø 120 mm (standard)"], ["140", "Ø 140 mm"], ["160", "Ø 160 mm"]])}
              />
            </Ligne>
            <Ligne
              label="Position des roues"
              aide="Auto : 1000 mm de chaque bord jusqu’à 4500 mm de vantail, 1200 mm jusqu’à 6000 mm, 1500 mm au-delà."
            >
              <Deroulant value={S("positionRoues")} onChange={(v) => set("positionRoues", v)} options={opts([["auto", "Automatique"], ["manuel", "Manuelle"]])} />
            </Ligne>
            <Ligne label="Axe roue arrière" aide="depuis l'extrémité queue">
              <Nombre value={S("positionRoues") === "auto" ? Math.round(G.d1) : N("axeRoueArriere")} onChange={(v) => set("axeRoueArriere", v)} min={0} max={4000} pas={25} unite="mm" disabled={S("positionRoues") === "auto"} />
            </Ligne>
            <Ligne label="Entraxe des roues">
              <Nombre value={S("positionRoues") === "auto" ? Math.round(G.ent) : N("entraxeRoues")} onChange={(v) => set("entraxeRoues", v)} min={200} max={9000} pas={25} unite="mm" disabled={S("positionRoues") === "auto"} />
            </Ligne>
            <Ligne label="Type de rail">
              <Deroulant
                value={S("rail")}
                onChange={(v) => set("rail", v)}
                options={opts([
                  ["rond20", "Rond plein Ø 20 sur support acier"],
                  ["visser", "Rail à visser"],
                  ["existant", "Rail existant conservé"],
                  ["aucun", "Non défini"],
                ])}
              />
            </Ligne>
            <Ligne label="Guidage supérieur">
              <Deroulant
                value={S("guidage")}
                onChange={(v) => set("guidage", v)}
                options={opts([["poteau", "Poteau à galets"], ["portique", "Portique"], ["platine", "Platine murale"], ["aucun", "Aucun"]])}
              />
            </Ligne>
            <Ligne label="Nombre de galets">
              <Deroulant value={String(N("nbGalets"))} onChange={(v) => set("nbGalets", parseFloat(v))} options={opts([["2", "2 galets"], ["3", "3 galets"], ["4", "4 galets"]])} />
            </Ligne>
            <Ligne label="Butées d'ouverture et de fermeture">
              <Deroulant value={S("butees")} onChange={(v) => set("butees", v)} options={opts([["oui", "Comprises"], ["non", "Non comprises"]])} />
            </Ligne>
          </Bloc>

          <Bloc titre="7. Réception et poteaux" ouvert={ouverts.reception} onToggle={() => bascule("reception")}>
            <Ligne label="Poteau de guidage">
              <Deroulant value={S("poteauGuidage")} onChange={(v) => set("poteauGuidage", v)} options={opts([["oui", "Compris"], ["non", "Non compris"]])} />
            </Ligne>
            <Ligne label="Poteau de réception">
              <Deroulant value={S("poteauReception")} onChange={(v) => set("poteauReception", v)} options={opts([["oui", "Compris"], ["non", "Non compris"]])} />
            </Ligne>
            <Ligne label="Section des poteaux">
              <Deroulant value={S("sectionPoteau")} onChange={(v) => set("sectionPoteau", v)} options={SECTIONS_POTEAU} />
            </Ligne>
            <Ligne
              label="Cote des poteaux acier"
              aide="Automatique = hors tout (ouvrage + garde au sol) + 60 mm."
            >
              <Deroulant
                value={S("hauteurPoteauMode") === "manuel" ? "manuel" : "auto"}
                onChange={(v) => {
                  setP((prev) => ({
                    ...prev,
                    hauteurPoteauMode: v,
                    ...(v === "manuel" ? { hauteurPoteau: G.hPoteauAuto } : {}),
                  }));
                }}
                options={opts([
                  ["auto", "Automatique (hors tout + 60 mm)"],
                  ["manuel", "Saisie manuelle (déconseillé)"],
                ])}
              />
            </Ligne>
            <Ligne label="Hauteur hors sol des poteaux">
              <Nombre
                value={S("hauteurPoteauMode") === "manuel" ? N("hauteurPoteau") : G.hPoteau}
                onChange={(v) => set("hauteurPoteau", v)}
                min={500}
                max={3500}
                pas={50}
                unite="mm"
                disabled={S("hauteurPoteauMode") !== "manuel"}
                presets={[1600, 1800, 2000, 2200]}
              />
            </Ligne>
            {S("hauteurPoteauMode") === "manuel" ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                Saisie manuelle déconseillée. Pour des poteaux acier, la cote auto est{" "}
                <strong>{mm(G.hPoteauAuto)}</strong> (hors tout {mm(G.HT)} + 60 mm). Ne changez
                cette valeur que si le site l’impose.
              </p>
            ) : null}
            <Ligne label="Profil de réception">
              <Deroulant
                value={S("profilReception")}
                onChange={(v) => set("profilReception", v)}
                options={opts([["U", "Profil en U"], ["fourche", "Fourche"], ["gache", "Gâche"], ["aucun", "Aucun"]])}
              />
            </Ligne>
          </Bloc>

          <Bloc titre="8. Manœuvre et motorisation" ouvert={ouverts.moteur} onToggle={() => bascule("moteur")}>
            <Ligne label="Manœuvre">
              <Deroulant value={S("motorisation")} onChange={(v) => set("motorisation", v)} options={opts([["manuel", "Manuelle"], ["motorise", "Motorisée"]])} />
            </Ligne>
            <Ligne label="Modèle de moteur">
              <Texte value={S("modeleMoteur")} onChange={(v) => set("modeleMoteur", v)} placeholder="Marque et modèle" />
            </Ligne>
            <Ligne label="Crémaillère">
              <Deroulant value={S("cremaillere")} onChange={(v) => set("cremaillere", v)} options={opts([["non", "Non comprise"], ["oui", "Comprise"]])} />
            </Ligne>
          </Bloc>

          <Bloc titre="9. Finition" ouvert={ouverts.finition} onToggle={() => bascule("finition")}>
            <Ligne label="Teinte RAL">
              <Deroulant value={S("ral")} onChange={(v) => set("ral", v)} options={RALS.map((r) => ({ v: r.v, l: r.l }))} />
            </Ligne>
            <Ligne label="Aspect">
              <Deroulant value={S("aspect")} onChange={(v) => set("aspect", v)} options={opts([["mat", "Mat"], ["satiné", "Satiné"], ["brillant", "Brillant"], ["texturé", "Texturé"]])} />
            </Ligne>
            <Ligne label="Préparation">
              <Deroulant
                value={S("preparation")}
                onChange={(v) => set("preparation", v)}
                options={opts([
                  ["thermolaquage direct", "Dégraissage + thermolaquage direct"],
                  ["grenaillage", "Grenaillage + thermolaquage"],
                  ["galvanisation", "Galvanisation + thermolaquage"],
                  ["métallisation", "Métallisation + thermolaquage"],
                ])}
              />
            </Ligne>
          </Bloc>

          <Bloc titre="10. Affichage du plan" ouvert={ouverts.affichage} onToggle={() => bascule("affichage")}>
            <Ligne label="Rendu">
              <Deroulant value={S("rendu")} onChange={(v) => set("rendu", v)} options={opts([["technique", "Technique (traits)"], ["realiste", "Teinte RAL"]])} />
            </Ligne>
            <Ligne label="Vantail en position ouverte">
              <Deroulant value={S("fantome")} onChange={(v) => set("fantome", v)} options={opts([["oui", "Affiché en pointillés"], ["non", "Masqué"]])} />
            </Ligne>
            <Ligne label="Cotes principales">
              <Deroulant value={S("cotes")} onChange={(v) => set("cotes", v)} options={opts([["oui", "Affichées"], ["non", "Masquées"]])} />
            </Ligne>
            <Ligne label="Cotes des roues">
              <Deroulant value={S("cotesRoues")} onChange={(v) => set("cotesRoues", v)} options={opts([["oui", "Affichées"], ["non", "Masquées"]])} />
            </Ligne>
            <Ligne label="Cartouche">
              <Deroulant value={S("cartouche")} onChange={(v) => set("cartouche", v)} options={opts([["oui", "Affiché"], ["non", "Masqué"]])} />
            </Ligne>
            <Ligne label="Logo officiel" aide="public/logo-mds.png">
              <Deroulant value={S("logoOfficiel")} onChange={(v) => set("logoOfficiel", v)} options={opts([["non", "Logo vectoriel intégré"], ["oui", "Fichier logo-mds.png"]])} />
            </Ligne>
          </Bloc>
        </aside>

        <div className="plan-apercu min-w-0 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto">
          <div className="plan-feuille overflow-hidden rounded-lg border border-stone-300 bg-white p-3">
            {dessin}
          </div>

          <div className="plan-no-print grid gap-4 xl:grid-cols-2">
            <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
              <h3 className="border-b border-stone-200 bg-stone-100 px-3 py-2 font-serif text-base text-stone-900">
                Contrôles techniques
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <tbody>
                    {controles.map((c) => (
                      <LigneTable
                        key={c.cle}
                        libelle={c.libelle}
                        valeur={c.valeur}
                        note={c.note}
                        etat={c.etat}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
              <h3 className="border-b border-stone-200 bg-stone-100 px-3 py-2 font-serif text-base text-stone-900">
                Aperçu matière — indicatif
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <tbody>
                    <LigneTable
                      libelle={`Poutre basse ${S("poutreBasse")}`}
                      valeur={`1 × ${mm(G.L)}`}
                    />
                    <LigneTable
                      libelle={`Traverse haute ${S("cadre")}`}
                      valeur={`1 × ${mm(G.xAv - G.xTrav)}`}
                    />
                    <LigneTable
                      libelle={`Montants ${S("cadre")}`}
                      valeur={`${G.montants.length} × ${mm(G.longMontant)}`}
                    />
                    <LigneTable
                      libelle={`Barreaudage ${S("sectionBarreau")}`}
                      valeur={`${G.nbBarreauxTotal} pièce(s) — ${arrondi(G.mlBarreaux, 1)} ml`}
                    />
                    <LigneTable
                      libelle={`Tôle ${N("toleEp")} mm`}
                      valeur={`${arrondi(G.surfaceTole, 2)} m²`}
                    />
                    <LigneTable
                      libelle="Poids estimatif du vantail"
                      valeur={<strong>{Math.round(G.poidsTotal)} kg</strong>}
                    />
                    <LigneTable
                      libelle="Surface à thermolaquer (2 faces)"
                      valeur={`${arrondi(G.surfaceOuvrage * 2 * (0.35 + G.occultation * 0.65), 2)} m²`}
                    />
                  </tbody>
                </table>
              </div>
              <p className="border-t border-stone-200 px-3 py-3 text-xs leading-relaxed text-stone-500">
                Valeurs indicatives de pré-dimensionnement. Elles ne remplacent ni le débit optimisé,
                ni la nomenclature, ni le chiffrage définitif, qui ne sont produits qu&apos;après la
                fiche de validation et l&apos;accord explicite « VALIDÉ POUR FABRICATION ».
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
