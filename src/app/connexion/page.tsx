"use client";

import { FormEvent, useState } from "react";

export default function ConnexionPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(code: string) {
    if (code.length !== 4 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: code }),
      });
      const data = (await response.json()) as {
        error?: string;
        user?: { isAdmin: boolean };
      };
      if (!response.ok) {
        setError(data.error || "Connexion impossible.");
        setPin("");
        return;
      }
      void fetch("/api/onedrive/keepalive", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        redirect: "manual",
        headers: { Accept: "application/json" },
      }).catch(() => {
        /* OneDrive en arrière-plan : ne jamais bloquer l’entrée. */
      });
      window.location.assign(data.user?.isAdmin ? "/" : "/moi");
    } catch {
      setError("Connexion impossible.");
      setPin("");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(pin);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3efe6] px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-stone-300 bg-white p-6 shadow-sm"
      >
        <p className="text-[11px] uppercase tracking-[0.22em] text-amber-700">
          Ferronnerie Vauchel
        </p>
        <h1 className="mt-1 font-serif text-2xl text-stone-900">Connexion</h1>
        <p className="mt-2 text-sm text-stone-600">
          Entrez votre code PIN à 4 chiffres.
        </p>
        <label className="mt-5 block text-sm">
          <span className="mb-1 block">Code PIN</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(next);
              if (next.length === 4) void submit(next);
            }}
            className="w-full rounded-lg border border-stone-300 px-3 py-3 text-center text-2xl tracking-[0.4em]"
            autoFocus
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={saving || pin.length !== 4}
          className="mt-5 w-full rounded-lg bg-amber-700 px-3 py-3 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {saving ? "Connexion…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
