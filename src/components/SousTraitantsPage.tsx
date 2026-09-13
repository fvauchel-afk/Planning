"use client";

import { useEffect, useState } from "react";
import { usePlanning } from "@/lib/planning-context";
import type { SousTraitant } from "@/lib/types";

const EMPTY = {
  nom: "",
  specialite: "",
  email: "",
  telephone: "",
  adresse: "",
};

export function SousTraitantsPage() {
  const { refresh } = usePlanning();
  const [rows, setRows] = useState<SousTraitant[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/sous-traitants");
    const data = (await res.json()) as { rows?: SousTraitant[]; error?: string };
    if (!res.ok) {
      setError(data.error || "Lecture impossible.");
      setRows([]);
      return;
    }
    setRows(data.rows ?? []);
    setError(null);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sous-traitants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId || undefined,
          ...form,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible.");
      setForm(EMPTY);
      setEditingId(null);
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Supprimer cette fiche sous-traitant ?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sous-traitants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      await load();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Sous-traitants</h2>
        <p className="mt-1 text-sm text-stone-600">
          Fiches utilisées pour les bons de commande (thermolaquage, galvanisation
          ou autre spécialité).
        </p>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <form
        className="grid gap-3 rounded-lg border border-stone-200 bg-white p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nom</span>
          <input
            value={form.nom}
            onChange={(event) => setForm({ ...form, nom: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Spécialité</span>
          <input
            value={form.specialite}
            onChange={(event) =>
              setForm({ ...form, specialite: event.target.value })
            }
            placeholder="Thermolaquage, Galvanisation…"
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">E-mail</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Téléphone (optionnel)</span>
          <input
            value={form.telephone}
            onChange={(event) =>
              setForm({ ...form, telephone: event.target.value })
            }
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Adresse (optionnelle)</span>
          <input
            value={form.adresse}
            onChange={(event) =>
              setForm({ ...form, adresse: event.target.value })
            }
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {editingId ? "Enregistrer" : "Ajouter"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-sm text-stone-600"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
            >
              Annuler
            </button>
          ) : null}
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="text-sm text-stone-500">Aucun sous-traitant pour le moment.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-stone-900">{row.nom}</p>
                <p className="text-sm text-stone-600">
                  {row.specialite} · {row.email}
                  {row.telephone ? ` · ${row.telephone}` : ""}
                </p>
                {row.adresse ? (
                  <p className="text-xs text-stone-500">{row.adresse}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm"
                  onClick={() => {
                    setEditingId(row.id);
                    setForm({
                      nom: row.nom,
                      specialite: row.specialite,
                      email: row.email,
                      telephone: row.telephone ?? "",
                      adresse: row.adresse ?? "",
                    });
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-800"
                  onClick={() => void remove(row.id)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
