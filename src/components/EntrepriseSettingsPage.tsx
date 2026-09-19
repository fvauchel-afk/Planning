"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import type { EntrepriseReglages } from "@/lib/devis/types";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

const EMPTY: EntrepriseReglages = {
  nom: "La Métallerie du Sud",
  forme_juridique: "SASU",
  adresse: "",
  code_postal: "",
  ville: "",
  telephone: "",
  email: "",
  capital_social: "",
  siret: "",
  code_naf: "",
  rcs: "",
  tva_intra: "",
  iban: "",
  bic: "",
};

const LABELS: { key: keyof EntrepriseReglages; label: string }[] = [
  { key: "nom", label: "Nom commercial" },
  { key: "forme_juridique", label: "Forme juridique" },
  { key: "adresse", label: "Adresse" },
  { key: "code_postal", label: "Code postal" },
  { key: "ville", label: "Ville" },
  { key: "telephone", label: "Téléphone" },
  { key: "email", label: "E-mail" },
  { key: "capital_social", label: "Capital social" },
  { key: "siret", label: "SIRET" },
  { key: "code_naf", label: "Code NAF" },
  { key: "rcs", label: "RCS" },
  { key: "tva_intra", label: "TVA intra-communautaire" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
];

export function EntrepriseSettingsPage() {
  const [form, setForm] = useState<EntrepriseReglages>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void devisApi<{ entreprise: EntrepriseReglages }>("/api/devis/reglages?kind=entreprise")
      .then((data) => setForm({ ...EMPTY, ...data.entreprise }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lecture impossible.");
      });
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await devisApi("/api/devis/reglages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "entreprise", entreprise: form }),
      });
      setOk("Enregistré. Ces mentions apparaissent sur le PDF (en-tête et pied de page).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm">
          <Link href="/devis" className="underline">
            Devis
          </Link>
        </p>
        <h2 className="mt-1 font-serif text-3xl text-stone-900">Entreprise</h2>
        <p className="mt-1 text-sm text-stone-600">
          Identité juridique et bancaire, à remplir une fois. Rien n’est figé dans le code.
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {ok ? (
        <p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">{ok}</p>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2">
        {LABELS.map((item) => (
          <label key={item.key} className="text-sm">
            {item.label}
            <input
              className={`${FIELD} mt-1`}
              value={form[item.key]}
              onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
            />
          </label>
        ))}
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
