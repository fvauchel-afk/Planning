"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  expired?: boolean;
  account: string | null;
  needsMigration?: boolean;
  error?: string;
  rootCached?: boolean;
};

export function OnedriveAdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQueryError(params.get("error"));
    fetch("/api/onedrive/status", { redirect: "manual" })
      .then((res) => res.json())
      .then((json: Status) => setStatus(json))
      .catch(() =>
        setStatus({
          connected: false,
          account: null,
          error: "Impossible de lire le statut OneDrive.",
        }),
      );
  }, []);

  const connected = Boolean(status?.connected);
  const expired = Boolean(status?.expired);

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="font-serif text-3xl text-stone-900">OneDrive</h2>
      <p className="text-sm text-stone-600">
        Connexion au compte Microsoft personnel de l’atelier (f.vauchel@hotmail.com).
        Les jetons restent côté serveur, jamais dans le navigateur. Ce même compte
        envoie les e-mails de commandes : reconnectez-le une fois pour accepter
        l’autorisation « envoyer un e-mail ».
      </p>

      {status === null ? (
        <p className="text-sm text-stone-500">Chargement du statut…</p>
      ) : (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            connected && !status.error
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {connected && !status.error ? (
            <>
              <p className="font-medium">OneDrive est connecté.</p>
              {status.account && (
                <p className="mt-1">Compte : {status.account}</p>
              )}
            </>
          ) : connected && status.error ? (
            <>
              <p className="font-medium">OneDrive est partiellement connecté.</p>
              {status.account && (
                <p className="mt-1">Compte : {status.account}</p>
              )}
              <p className="mt-2 text-amber-900">{status.error}</p>
            </>
          ) : expired ? (
            <>
              <p className="font-medium">
                Connexion expirée, reconnexion nécessaire.
              </p>
              {status.account && (
                <p className="mt-1">Dernier compte : {status.account}</p>
              )}
              <p className="mt-2 text-amber-900">
                {status.error?.trim() ||
                  "Un jeton est encore enregistré, mais Microsoft refuse les appels (dossier chantier, sauvegarde). Cliquez sur « Connecter OneDrive »."}
              </p>
            </>
          ) : (
            <p className="font-medium">OneDrive n’est pas connecté.</p>
          )}
        </div>
      )}

      {status?.error && !status.needsMigration && !connected && !expired && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.error}
        </p>
      )}

      {status?.needsMigration && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {status.error}
        </p>
      )}

      {queryError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {queryError}
        </p>
      )}

      <form method="post" action="/api/onedrive/login">
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white"
        >
          Connecter OneDrive
        </button>
      </form>

      <div className="border-t border-stone-200 pt-4">
        <h3 className="font-medium text-stone-900">Sauvegarde</h3>
        <p className="mt-1 text-sm text-stone-600">
          Les copies quotidiennes et la restauration se gèrent dans l’onglet{" "}
          <a href="/sauvegarde" className="underline">
            Sauvegarde
          </a>
          .
        </p>
      </div>
    </section>
  );
}
