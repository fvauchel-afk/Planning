"use client";

import { useEffect, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import {
  EMPTY_ENTREPRISE,
  MAX_LOGO_BASE64,
  type EntrepriseReglages,
} from "@/lib/devis/types";

const FIELD = "w-full rounded border border-stone-300 px-3 py-2 text-sm";

const LABELS: { key: keyof EntrepriseReglages; label: string }[] = [
  { key: "nom", label: "Nom de la société" },
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
  const [form, setForm] = useState<EntrepriseReglages>(EMPTY_ENTREPRISE);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void devisApi<{ entreprise: EntrepriseReglages }>("/api/devis/reglages?kind=entreprise")
      .then((data) => setForm({ ...EMPTY_ENTREPRISE, ...data.entreprise }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Lecture impossible.");
      });
  }, []);

  function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setError("Le logo doit être un JPEG ou un PNG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      const comma = url.indexOf(",");
      const b64 = comma >= 0 ? url.slice(comma + 1) : url;
      if (b64.length > MAX_LOGO_BASE64) {
        setError("Logo trop lourd. Choisissez un fichier plus léger.");
        return;
      }
      setError(null);
      setForm((cur) => ({ ...cur, logo_base64: b64, logo_mime: file.type }));
    };
    reader.readAsDataURL(file);
  }

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

  const preview =
    form.logo_base64 && form.logo_mime
      ? `data:${form.logo_mime};base64,${form.logo_base64}`
      : "";

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-serif text-xl text-stone-900">Société</h3>
        <p className="mt-1 text-sm text-stone-600">
          Identité juridique et bancaire, plus le logo du PDF. Rien n’est figé dans le code.
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
        <div className="text-sm md:col-span-2">
          <p className="font-medium">Logo</p>
          <p className="mb-2 text-xs text-stone-500">JPEG ou PNG, pour l’en-tête des devis.</p>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo" className="mb-2 h-16 w-auto rounded border border-stone-200 bg-white" />
          ) : (
            <p className="mb-2 text-xs text-stone-500">Aucun logo pour l’instant.</p>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => onLogo(e.target.files?.[0])}
          />
          {form.logo_base64 ? (
            <button
              type="button"
              className="ml-3 text-sm underline"
              onClick={() => setForm({ ...form, logo_base64: "", logo_mime: "" })}
            >
              Retirer
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50"
      >
        Enregistrer la société
      </button>
    </section>
  );
}
