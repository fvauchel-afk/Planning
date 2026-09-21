"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlanOuvrageTabs } from "@/components/PlanOuvrageTabs";
import { FormNotice } from "@/components/FormNotice";
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
  { v: "6005", l: "RAL 6005 — Vert mousse", hex: "#114232" },
];

const DEFAUTS: Params = {
  ouvrage: "pergola",
  client: "",
  reference: "",
  devis: "",
  indice: "A",
  date: "",
  delai: "4 à 5 semaines après validation",
  dessinateur: "Mickael Mahieux",
  statutDoc: "PLAN DE PRINCIPE",
  largeur: 4000,
  profondeur: 3000,
  hauteur: 2500,
  toiture: "lames-fixes",
  orientationLames: "largeur",
  pasLames: 180,
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
  next.ouvrage = "pergola";
  return next;
}

function mm(n: number) {
  return `${Math.round(n)} mm`;
}

export function PlanPergola() {
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
        const plan = (data.rows ?? []).find((row) => String(row.params.ouvrage ?? "") === "pergola");
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
    const L = Math.max(1500, N("largeur"));
    const P = Math.max(1500, N("profondeur"));
    const H = Math.max(2000, N("hauteur"));
    const span = 3000;
    const nbX = Math.max(2, Math.ceil(L / span) + 1);
    const nbY = Math.max(2, Math.ceil(P / span) + 1);
    const pas = Math.max(80, N("pasLames"));
    const nbLames = S("orientationLames") === "largeur" ? Math.max(4, Math.round(P / pas)) : Math.max(4, Math.round(L / pas));
    const ral = RALS.find((r) => r.v === S("ral"))?.hex ?? "#383E42";
    return { L, P, H, nbX, nbY, nbLames, ral, nbPoteaux: nbX * nbY };
  }, [N, S]);

  const dessin = useMemo(() => {
    const W = 1600;
    const HH = 820;
    const ral = calc.ral;
    const elevY = 70;
    const solY = 420;
    const sH = Math.min((solY - elevY - 20) / calc.H, 0.12);
    const sL = Math.min(1400 / calc.L, 0.32);
    const x0 = 100;
    const yHaut = solY - calc.H * sH;
    const posts: ReactElement[] = [];
    for (let i = 0; i < calc.nbX; i++) {
      const x = x0 + (i * calc.L * sL) / Math.max(1, calc.nbX - 1);
      posts.push(
        <rect key={`e${i}`} x={x - 7} y={yHaut} width={14} height={calc.H * sH} fill={ral} stroke={ACIER} />,
      );
    }
    const lames: ReactElement[] = [];
    if (S("toiture") !== "polycarbonate") {
      for (let i = 0; i < calc.nbLames; i++) {
        const x = x0 + 8 + (i * (calc.L * sL - 16)) / Math.max(1, calc.nbLames - 1);
        lames.push(
          <rect key={`lm${i}`} x={x} y={yHaut - 10} width={6} height={18} fill={ral} transform={`rotate(-18 ${x} ${yHaut})`} />,
        );
      }
    } else {
      lames.push(
        <rect
          key="pc"
          x={x0}
          y={yHaut - 8}
          width={calc.L * sL}
          height={14}
          fill="#9ec4e8"
          opacity={0.7}
          stroke={ACIER}
        />,
      );
    }
    const topX = 100;
    const topY = 480;
    const tS = Math.min(600 / calc.L, 260 / calc.P);
    const topPosts: ReactElement[] = [];
    for (let iy = 0; iy < calc.nbY; iy++) {
      for (let ix = 0; ix < calc.nbX; ix++) {
        const x = topX + (ix * calc.L * tS) / Math.max(1, calc.nbX - 1);
        const y = topY + (iy * calc.P * tS) / Math.max(1, calc.nbY - 1);
        topPosts.push(<circle key={`t${ix}-${iy}`} cx={x} cy={y} r={6} fill={ral} stroke={ACIER} />);
      }
    }
    return (
      <svg id="plan-leo-svg" viewBox={`0 0 ${W} ${HH}`} width="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width={W} height={HH} fill="#fff" />
        <text x={40} y={36} fontSize={16} fontWeight={700} fill={ACIER}>
          PERGOLA — ÉLÉVATION FACE
        </text>
        <line x1={40} y1={solY} x2={W - 40} y2={solY} stroke={ACIER} strokeWidth={2} />
        <rect x={x0} y={yHaut} width={calc.L * sL} height={10} fill={ral} />
        {lames}
        {posts}
        {S("cotes") === "oui" ? (
          <>
            <line x1={x0} y1={solY + 28} x2={x0 + calc.L * sL} y2={solY + 28} stroke={BLEU} />
            <text x={x0 + (calc.L * sL) / 2} y={solY + 46} textAnchor="middle" fontSize={13} fill={BLEU} fontWeight={700}>
              Largeur {mm(calc.L)}
            </text>
            <text x={x0 + calc.L * sL + 36} y={(yHaut + solY) / 2} fontSize={13} fill={BLEU} fontWeight={700}>
              H {mm(calc.H)}
            </text>
          </>
        ) : null}
        <text x={40} y={topY - 16} fontSize={16} fontWeight={700} fill={ACIER}>
          VUE DE DESSUS
        </text>
        <rect x={topX} y={topY} width={calc.L * tS} height={calc.P * tS} fill="none" stroke={ACIER} strokeWidth={2} />
        {topPosts}
        {S("cotes") === "oui" ? (
          <text x={topX + (calc.L * tS) / 2} y={topY + calc.P * tS + 22} textAnchor="middle" fontSize={13} fill={BLEU} fontWeight={700}>
            {mm(calc.L)} × {mm(calc.P)}
          </text>
        ) : null}
        <text x={40} y={HH - 24} fontSize={12} fill={BLEU} fontWeight={700}>
          {S("statutDoc")} — {S("toiture")} — RAL {S("ral")} — {calc.nbPoteaux} poteaux — {S("client") || "client"}
        </text>
      </svg>
    );
  }, [calc, S]);

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
          <h2 className="font-serif text-3xl text-stone-900">Plan — Pergola</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Largeur, profondeur, hauteur et toiture. Élévation + vue de dessus, enregistrement
            OneDrive dans le dossier du client.
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
      {saveErr ? <FormNotice>{saveErr}</FormNotice> : null}
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
      <PlanOuvrageTabs current="pergola" />
      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="plan-no-print space-y-3 rounded-lg border border-stone-200 bg-white p-3">
          <label className="block text-sm">
            Client
            <input className={`${CHAMP} mt-1`} value={S("client")} onChange={(e) => set("client", e.target.value)} list="plan-pg-chantiers" />
            <datalist id="plan-pg-chantiers">
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
            Largeur (face)
            <input type="number" className={`${CHAMP} mt-1`} value={N("largeur")} onChange={(e) => set("largeur", Number(e.target.value) || 0)} />
          </label>
          <label className="block text-sm">
            Profondeur
            <input type="number" className={`${CHAMP} mt-1`} value={N("profondeur")} onChange={(e) => set("profondeur", Number(e.target.value) || 0)} />
          </label>
          <label className="block text-sm">
            Hauteur sous toiture
            <input type="number" className={`${CHAMP} mt-1`} value={N("hauteur")} onChange={(e) => set("hauteur", Number(e.target.value) || 0)} />
          </label>
          <label className="block text-sm">
            Toiture
            <select className={`${CHAMP} mt-1`} value={S("toiture")} onChange={(e) => set("toiture", e.target.value)}>
              <option value="lames-fixes">Lames fixes</option>
              <option value="lames-orientables">Lames orientables</option>
              <option value="polycarbonate">Polycarbonate</option>
            </select>
          </label>
          <label className="block text-sm">
            Orientation des lames
            <select className={`${CHAMP} mt-1`} value={S("orientationLames")} onChange={(e) => set("orientationLames", e.target.value)}>
              <option value="largeur">Parallèles à la largeur</option>
              <option value="profondeur">Parallèles à la profondeur</option>
            </select>
          </label>
          <label className="block text-sm">
            Pas des lames (mm)
            <input type="number" className={`${CHAMP} mt-1`} value={N("pasLames")} onChange={(e) => set("pasLames", Number(e.target.value) || 0)} />
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
            {calc.nbPoteaux} poteaux ({calc.nbX} × {calc.nbY}) · {calc.nbLames} lames
          </p>
        </aside>
        <div className="min-w-0 overflow-hidden rounded-lg border border-stone-300 bg-white p-3">{dessin}</div>
      </div>
    </section>
  );
}
