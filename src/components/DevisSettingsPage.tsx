"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import { MAIL_VARIABLES_AIDE } from "@/lib/devis/defaults";
import type { DevisReglages } from "@/lib/devis/types";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

export function DevisSettingsPage() {
  const [form, setForm] = useState<DevisReglages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void devisApi<{ reglages: DevisReglages }>("/api/devis/reglages?kind=devis")
      .then((data) => setForm(data.reglages))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lecture impossible.");
      });
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await devisApi("/api/devis/reglages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "devis", reglages: form }),
      });
      setOk("Enregistré. Les prochains envois et PDF utilisent ces textes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!form && !error) {
    return <p className="text-sm text-stone-500">Chargement…</p>;
  }
  if (!form) {
    return <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm">
          <Link href="/devis" className="underline">
            Devis
          </Link>
        </p>
        <h2 className="mt-1 font-serif text-3xl text-stone-900">Paramètres Devis</h2>
        <p className="mt-1 text-sm text-stone-600">
          Modèle d’e-mail et conditions d’acceptation. {MAIL_VARIABLES_AIDE}
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">{ok}</p>
      ) : null}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
        <label className="block text-sm">
          Validité par défaut (jours)
          <input
            type="number"
            min={1}
            className={`${FIELD} mt-1 max-w-xs`}
            value={form.validite_jours_defaut}
            onChange={(e) => setForm({ ...form, validite_jours_defaut: Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm">
          Objet du mail
          <input
            className={`${FIELD} mt-1`}
            value={form.mail_sujet}
            onChange={(e) => setForm({ ...form, mail_sujet: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Corps du mail
          <textarea
            className={`${FIELD} mt-1 font-mono text-xs`}
            rows={10}
            value={form.mail_corps}
            onChange={(e) => setForm({ ...form, mail_corps: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.conditions_acceptation_actif}
            onChange={(e) => setForm({ ...form, conditions_acceptation_actif: e.target.checked })}
          />
          Conditions d&apos;acceptation actives par défaut
        </label>
        <label className="block text-sm">
          Texte des conditions d&apos;acceptation
          <textarea
            className={`${FIELD} mt-1`}
            rows={8}
            value={form.conditions_acceptation_texte}
            onChange={(e) => setForm({ ...form, conditions_acceptation_texte: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.champ_libre_actif}
            onChange={(e) => setForm({ ...form, champ_libre_actif: e.target.checked })}
          />
          Champ libre actif par défaut
        </label>
        <label className="block text-sm">
          Texte du champ libre
          <textarea
            className={`${FIELD} mt-1`}
            rows={4}
            value={form.champ_libre_texte}
            onChange={(e) => setForm({ ...form, champ_libre_texte: e.target.value })}
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50"
      >
        Enregistrer
      </button>
    </section>
  );
}
