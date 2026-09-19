"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { devisApi } from "@/lib/devis/client-api";
import type { ClientFiche } from "@/lib/devis/types";

export function ClientsPage() {
  const [rows, setRows] = useState<ClientFiche[]>([]);
  const [form, setForm] = useState({
    nom: "",
    email: "",
    telephone: "",
    adresse: "",
    code_postal: "",
    ville: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const data = await devisApi<{ rows: ClientFiche[] }>("/api/clients");
    setRows(data.rows ?? []);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Lecture impossible.");
    });
  }, [load]);

  async function create() {
    if (!form.nom.trim()) {
      setError("Le nom du client est obligatoire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await devisApi("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({
        nom: "",
        email: "",
        telephone: "",
        adresse: "",
        code_postal: "",
        ville: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const visible = rows.filter((row) => {
    const hay = `${row.nom} ${row.email ?? ""} ${row.ville ?? ""} ${row.telephone ?? ""}`.toLowerCase();
    return !q.trim() || hay.includes(q.trim().toLowerCase());
  });

  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm">
          <Link href="/devis" className="underline">
            Devis
          </Link>
        </p>
        <h2 className="mt-1 font-serif text-3xl text-stone-900">Fiches clients</h2>
        <p className="mt-1 text-sm text-stone-600">
          Coordonnées pour les devis. Un client peut avoir plusieurs devis.
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
          void create();
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
          <span className="mb-1 block font-medium">E-mail</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Téléphone</span>
          <input
            value={form.telephone}
            onChange={(event) => setForm({ ...form, telephone: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Adresse</span>
          <input
            value={form.adresse}
            onChange={(event) => setForm({ ...form, adresse: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Code postal</span>
          <input
            value={form.code_postal}
            onChange={(event) => setForm({ ...form, code_postal: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Ville</span>
          <input
            value={form.ville}
            onChange={(event) => setForm({ ...form, ville: event.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Notes internes</span>
          <textarea
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            className="min-h-[4rem] w-full rounded border border-stone-300 px-3 py-2"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-50"
          >
            Créer la fiche
          </button>
        </div>
      </form>

      <input
        value={q}
        onChange={(event) => setQ(event.target.value)}
        placeholder="Recherche…"
        className="w-full rounded border border-stone-300 px-3 py-2 text-sm"
      />

      {visible.length === 0 ? (
        <p className="text-sm text-stone-600">Aucune fiche pour le moment.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-stone-100 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nom</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2 font-medium">Téléphone</th>
                <th className="px-3 py-2 font-medium">Ville</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-t border-stone-200">
                  <td className="px-3 py-2">
                    <Link href={`/devis/clients/${row.id}`} className="font-medium underline">
                      {row.nom}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{row.email || "—"}</td>
                  <td className="px-3 py-2">{row.telephone || "—"}</td>
                  <td className="px-3 py-2">
                    {[row.code_postal, row.ville].filter(Boolean).join(" ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
