"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedPatch } from "@/lib/form-live";
import { FormNotice } from "@/components/FormNotice";
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
  const { refresh, snapshot } = usePlanning();
  const [rows, setRows] = useState<SousTraitant[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(new Set<string>());

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

  useEffect(() => {
    if (snapshot.sousTraitants?.length) {
      setRows(snapshot.sousTraitants);
    }
  }, [snapshot.sousTraitants]);

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(poll, 4000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  const applyPatch = useCallback(
    async (payload: {
      nom?: string;
      specialite?: string;
      email?: string;
      telephone?: string | null;
      adresse?: string | null;
    }) => {
      if (!editingId) return;
      const res = await fetch("/api/sous-traitants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Enregistrement impossible.");
        return;
      }
      Object.keys(payload).forEach((key) => dirty.current.delete(key));
      await load();
      await refresh();
    },
    [editingId, refresh],
  );
  const live = useDebouncedPatch(applyPatch);

  useEffect(() => {
    if (!editingId) return;
    const remote = rows.find((row) => row.id === editingId);
    if (!remote) return;
    setForm((current) => ({
      nom: dirty.current.has("nom") ? current.nom : remote.nom,
      specialite: dirty.current.has("specialite")
        ? current.specialite
        : remote.specialite,
      email: dirty.current.has("email") ? current.email : remote.email,
      telephone: dirty.current.has("telephone")
        ? current.telephone
        : (remote.telephone ?? ""),
      adresse: dirty.current.has("adresse")
        ? current.adresse
        : (remote.adresse ?? ""),
    }));
  }, [rows, editingId]);

  function updateField<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    dirty.current.add(key);
    if (!editingId) return;
    if (key === "nom" || key === "specialite" || key === "email") {
      if (!value.trim()) return;
      if (key === "email" && !value.trim().includes("@")) return;
      live.schedule({ [key]: value.trim() } as never);
      return;
    }
    live.schedule({ [key]: value.trim() || null } as never);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await live.flush();
      if (editingId) {
        await load();
        await refresh();
        return;
      }
      const res = await fetch("/api/sous-traitants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Enregistrement impossible.");
      setForm(EMPTY);
      dirty.current.clear();
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
      if (editingId === id) {
        live.cancel();
        setEditingId(null);
        setForm(EMPTY);
        dirty.current.clear();
      }
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
          ou autre spécialité). Sur une fiche ouverte, les champs s’enregistrent
          tout seuls.
        </p>
      </div>
      {error ? <FormNotice>{error}</FormNotice> : null}
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
            onChange={(event) => updateField("nom", event.target.value)}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Spécialité</span>
          <input
            value={form.specialite}
            onChange={(event) => updateField("specialite", event.target.value)}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
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
            onChange={(event) => updateField("email", event.target.value)}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Téléphone (optionnel)</span>
          <input
            value={form.telephone}
            onChange={(event) => updateField("telephone", event.target.value)}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Adresse (optionnelle)</span>
          <input
            value={form.adresse}
            onChange={(event) => updateField("adresse", event.target.value)}
            onBlur={() => {
              if (editingId) void live.flush();
            }}
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
                live.cancel();
                setEditingId(null);
                setForm(EMPTY);
                dirty.current.clear();
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
                    live.cancel();
                    dirty.current.clear();
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
