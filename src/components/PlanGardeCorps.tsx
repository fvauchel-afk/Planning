"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlanOuvrageTabs } from "@/components/PlanOuvrageTabs";
import { matchByClientNom } from "@/lib/plan-leo/match";
import type { PlanLeo } from "@/lib/plan-leo/types";
import { usePlanning } from "@/lib/planning-context";

const BLEU = "#2A5790";
const ACIER = "#3A3A3A";
const CHAMP = "w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm";

type Params = Record<string, string | number>;

const RALS = [
  { v: "7016", l: "RAL 7016 — Gris anthracite", hex: "#383E42" },
  { v: "9005", l: "RAL 9005 — Noir foncé", hex: "#17171A" },
  { v: "9010", l: "RAL 9010 — Blanc pur", hex: "#F1ECE1" },
  { v: "7039", l: "RAL 7039 — Gris quartz", hex: "#6B665E" },
  { v: "6005", l: "RAL 6005 — Vert mousse", hex: "#114232" },
];

const DEFAUTS: Params = {
  ouvrage: "garde-corps",
  client: "",
  reference: "",
  devis: "",
  indice: "A",
  date: "",
  delai: "4 à 5 semaines après validation",
  dessinateur: "Mickael Mahieux",
  statutDoc: "PLAN DE PRINCIPE",
  longueur: 4000,
  hauteur: 1000,
  pose: "dalle",
  remplissage: "barreaux-v",
  sectionPoteau: "80x80x3",
  sectionLisse: "40x40x2",
  sectionBarreau: "20x20x1.5",
  entraxeMax: 110,
  plinthe: "oui",
  hauteurPlinthe: 100,
  mainCourante: "oui",
  ral: "7016",
  aspect: "mat",
  cotes: "oui",
};

function mergeParams(raw: Record<string, string | number>): Params {
  const next: Params = { ...DEFAUTS };
  for (const key of Object.keys(DEFAUTS)) {
    if (raw[key] === undefined || raw[key] === null) continue;
    const def = DEFAUTS[key];
    next[key] = typeof def === "number" ? Number(raw[key]) || 0 : String(raw[key]);
  }
  next.ouvrage = "garde-corps";
  return next;
}

function mm(n: number) {
  return `${Math.round(n)} mm`;
}

export function PlanGardeCorps() {
  const searchParams = useSearchParams();
  const { snapshot } = usePlanning();
  const [p, setP] = useState<Params>(DEFAUTS);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [lienChantierId, setLienChantierId] = useState<string | null>(
    searchParams.get("chantier")?.trim() || null,
  );

  const S = useCallback((k: string) => String(p[k] ?? ""), [p]);
  const N = useCallback((k: string) => Number(p[k]) || 0, [p]);
  const set = (k: string, v: string | number) => setP((cur) => ({ ...cur, [k]: v }));

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
          const data = (await res.json()) as { plan?: PlanLeo };
          if (!res.ok || cancelled || !data.plan) return;
          setLienChantierId(data.plan.chantier_id);
          setP(mergeParams(data.plan.params));
          return;
        }
        const qs = new URLSearchParams();
        if (chantierId) qs.set("chantierId", chantierId);
        if (clientQ) qs.set("client", clientQ);
        if (!qs.toString()) return;
        const res = await fetch(`/api/plan-leo?${qs.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as { rows?: PlanLeo[] };
        const plan = (data.rows ?? []).find((row) => String(row.params.ouvrage ?? "") === "garde-corps");
        if (cancelled) return;
        if (!plan) {
          if (clientQ) setP((prev) => ({ ...prev, client: prev.client || clientQ }));
          return;
        }
        setLienChantierId(plan.chantier_id || chantierId || null);
        setP(mergeParams(plan.params));
      } catch (err) {
        if (!cancelled) setSaveErr(err instanceof Error ? err.message : "Lecture impossible.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const calc = useMemo(() => {
    const L = Math.max(800, N("longueur"));
    const H = Math.max(400, N("hauteur"));
    const entraxeMax = Math.max(60, N("entraxeMax"));
    const poteau = 80;
    const traveeUtile = 1500;
    const nbTravees = Math.max(1, Math.ceil(L / traveeUtile));
    const nbPoteaux = nbTravees + 1;
    const entraxePoteaux = L / nbTravees;
    const clair = entraxePoteaux - poteau;
    const nbBarreaux = S("remplissage") === "barreaux-v" ? Math.max(2, Math.floor(clair / entraxeMax)) : 0;
    const entraxeBarreaux = nbBarreaux > 1 ? clair / (nbBarreaux + 1) : clair / 2;
    const ral = RALS.find((r) => r.v === S("ral"))?.hex ?? "#383E42";
    return { L, H, nbTravees, nbPoteaux, entraxePoteaux, nbBarreaux, entraxeBarreaux, ral, poteau };
  }, [N, S]);

  const dessin = useMemo(() => {
    const W = 1600;
    const HH = 620;
    const padX = 80;
    const solY = 480;
    const scale = Math.min((W - padX * 2) / calc.L, 320 / calc.H);
    const x0 = padX;
    const yHaut = solY - calc.H * scale;
    const fill = calc.ral;
    const posts: ReactElement[] = [];
    for (let i = 0; i < calc.nbPoteaux; i++) {
      const x = x0 + i * calc.entraxePoteaux * scale;
      posts.push(
        <rect
          key={`p${i}`}
          x={x - 6}
          y={yHaut}
          width={12}
          height={calc.H * scale}
          fill={fill}
          stroke={ACIER}
          strokeWidth={1}
        />,
      );
    }
    const infill: ReactElement[] = [];
    if (S("remplissage") === "barreaux-v") {
      for (let t = 0; t < calc.nbTravees; t++) {
        const xa = x0 + t * calc.entraxePoteaux * scale + 8;
        const xb = x0 + (t + 1) * calc.entraxePoteaux * scale - 8;
        const n = calc.nbBarreaux;
        for (let b = 1; b <= n; b++) {
          const x = xa + ((xb - xa) * b) / (n + 1);
          infill.push(
            <line key={`b${t}-${b}`} x1={x} y1={yHaut + 14} x2={x} y2={solY - 18} stroke={fill} strokeWidth={3} />,
          );
        }
      }
    } else if (S("remplissage") === "lisses-h") {
      for (let k = 1; k <= 4; k++) {
        const y = yHaut + (k * (solY - yHaut)) / 5;
        infill.push(
          <line key={`l${k}`} x1={x0} y1={y} x2={x0 + calc.L * scale} y2={y} stroke={fill} strokeWidth={4} />,
        );
      }
    } else {
      infill.push(
        <rect
          key="pan"
          x={x0}
          y={yHaut + 10}
          width={calc.L * scale}
          height={calc.H * scale - 20}
          fill={S("remplissage") === "verre" ? "#c5d8ea" : fill}
          opacity={S("remplissage") === "verre" ? 0.55 : 0.85}
          stroke={ACIER}
        />,
      );
    }
    const cotes: ReactElement[] = [];
    if (S("cotes") === "oui") {
      cotes.push(
        <line key="ch" x1={x0} y1={solY + 40} x2={x0 + calc.L * scale} y2={solY + 40} stroke={BLEU} />,
        <text key="cht" x={x0 + (calc.L * scale) / 2} y={solY + 58} textAnchor="middle" fontSize={13} fill={BLEU} fontWeight={700}>
          Longueur {mm(calc.L)}
        </text>,
        <line key="cv" x1={x0 + calc.L * scale + 28} y1={yHaut} x2={x0 + calc.L * scale + 28} y2={solY} stroke={BLEU} />,
        <text
          key="cvt"
          x={x0 + calc.L * scale + 42}
          y={(yHaut + solY) / 2}
          fontSize={13}
          fill={BLEU}
          fontWeight={700}
          transform={`rotate(-90 ${x0 + calc.L * scale + 42} ${(yHaut + solY) / 2})`}
        >
          Hauteur {mm(calc.H)}
        </text>,
      );
    }
    return (
      <svg id="plan-leo-svg" viewBox={`0 0 ${W} ${HH}`} width="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width={W} height={HH} fill="#fff" />
        <text x={40} y={36} fontSize={16} fontWeight={700} fill={ACIER}>
          GARDE-CORPS — ÉLÉVATION
        </text>
        <line x1={40} y1={solY} x2={W - 40} y2={solY} stroke={ACIER} strokeWidth={2} />
        {S("mainCourante") === "oui" ? (
          <rect x={x0 - 4} y={yHaut - 8} width={calc.L * scale + 8} height={10} fill={fill} stroke={ACIER} />
        ) : null}
        {S("plinthe") === "oui" ? (
          <rect
            x={x0}
            y={solY - Math.min(24, N("hauteurPlinthe") * scale)}
            width={calc.L * scale}
            height={Math.min(24, N("hauteurPlinthe") * scale)}
            fill={fill}
            stroke={ACIER}
          />
        ) : null}
        {infill}
        {posts}
        {cotes}
        <text x={40} y={HH - 24} fontSize={12} fill={BLEU} fontWeight={700}>
          {S("statutDoc")} — RAL {S("ral")} {S("aspect")} — {S("client") || "client"}
        </text>
      </svg>
    );
  }, [calc, N, S]);

  const chantiersLies = matchByClientNom(snapshot.chantiers, S("client"));
  const chantierOuvert = lienChantierId
    ? snapshot.chantiers.find((c) => c.id === lienChantierId)
    : chantiersLies[0];

  async function enregistrer() {
    setSaveBusy(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const n = typeof document !== "undefined" ? document.getElementById("plan-leo-svg") : null;
      const svg = n ? new XMLSerializer().serializeToString(n) : "";
      const res = await fetch("/api/plan-leo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: p,
          svg,
          chantierId: chantierOuvert?.id ?? lienChantierId,
        }),
      });
      const data = (await res.json()) as { folder?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible.");
      setSaveMsg(`Enregistré dans le dossier OneDrive « ${data.folder} » (JSON + SVG).`);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="plan-no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Plan — Garde-corps</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Longueur, hauteur, remplissage et finition : le dessin se met à jour tout de suite.
            Même enregistrement OneDrive que le portail LEO (dossier du client).
          </p>
        </div>
        <button
          type="button"
          disabled={saveBusy}
          className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-amber-50 disabled:opacity-60"
          onClick={() => void enregistrer()}
        >
          {saveBusy ? "Enregistrement…" : "Enregistrer sur OneDrive"}
        </button>
      </div>
      {saveErr ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{saveErr}</p>
      ) : null}
      {saveMsg ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{saveMsg}</p>
      ) : null}
      {chantierOuvert ? (
        <p className="plan-no-print text-sm">
          Lié au chantier{" "}
          <Link href={`/chantiers?fiche=${encodeURIComponent(chantierOuvert.id)}`} className="underline">
            {chantierOuvert.nom_client}
          </Link>
        </p>
      ) : null}
      <PlanOuvrageTabs current="garde-corps" />
      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="plan-no-print space-y-3 rounded-lg border border-stone-200 bg-white p-3">
          <label className="block text-sm">
            Client
            <input className={`${CHAMP} mt-1`} value={S("client")} onChange={(e) => set("client", e.target.value)} list="plan-gc-chantiers" />
            <datalist id="plan-gc-chantiers">
              {snapshot.chantiers.map((c) => (
                <option key={c.id} value={c.nom_client} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm">
            Référence
            <input className={`${CHAMP} mt-1`} value={S("reference")} onChange={(e) => set("reference", e.target.value)} />
          </label>
          <label className="block text-sm">
            Longueur
            <input
              type="number"
              className={`${CHAMP} mt-1`}
              value={N("longueur")}
              onChange={(e) => set("longueur", Number(e.target.value) || 0)}
            />
          </label>
          <label className="block text-sm">
            Hauteur
            <input
              type="number"
              className={`${CHAMP} mt-1`}
              value={N("hauteur")}
              onChange={(e) => set("hauteur", Number(e.target.value) || 0)}
            />
          </label>
          <label className="block text-sm">
            Pose
            <select className={`${CHAMP} mt-1`} value={S("pose")} onChange={(e) => set("pose", e.target.value)}>
              <option value="dalle">Sur dalle</option>
              <option value="nez">Nez de dalle</option>
              <option value="muret">Sur muret</option>
            </select>
          </label>
          <label className="block text-sm">
            Remplissage
            <select className={`${CHAMP} mt-1`} value={S("remplissage")} onChange={(e) => set("remplissage", e.target.value)}>
              <option value="barreaux-v">Barreaux verticaux</option>
              <option value="lisses-h">Lisses horizontales</option>
              <option value="tole">Tôle</option>
              <option value="verre">Verre</option>
            </select>
          </label>
          {S("remplissage") === "barreaux-v" ? (
            <label className="block text-sm">
              Entraxe max. barreaux (mm)
              <input
                type="number"
                className={`${CHAMP} mt-1`}
                value={N("entraxeMax")}
                onChange={(e) => set("entraxeMax", Number(e.target.value) || 0)}
              />
            </label>
          ) : null}
          <label className="block text-sm">
            Main courante
            <select className={`${CHAMP} mt-1`} value={S("mainCourante")} onChange={(e) => set("mainCourante", e.target.value)}>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
          <label className="block text-sm">
            Plinthe
            <select className={`${CHAMP} mt-1`} value={S("plinthe")} onChange={(e) => set("plinthe", e.target.value)}>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
          <label className="block text-sm">
            RAL
            <select className={`${CHAMP} mt-1`} value={S("ral")} onChange={(e) => set("ral", e.target.value)}>
              {RALS.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-stone-500">
            {calc.nbPoteaux} poteaux · {calc.nbTravees} travée(s)
            {S("remplissage") === "barreaux-v" ? ` · ${calc.nbBarreaux} barreaux / travée` : ""}
          </p>
        </aside>
        <div className="min-w-0 overflow-hidden rounded-lg border border-stone-300 bg-white p-3">{dessin}</div>
      </div>
    </section>
  );
}
