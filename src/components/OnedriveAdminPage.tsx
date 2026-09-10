"use client";

import { useEffect, useState } from "react";

type Status = {
  connected: boolean;
  account: string | null;
  needsMigration?: boolean;
  error?: string;
  rootCached?: boolean;
};

type BackupCounts = Record<string, number>;

function formatBackupMessage(json: {
  fileName?: string;
  createdAt?: string;
  totalRows?: number;
  counts?: BackupCounts;
}): string {
  const when = json.createdAt
    ? new Date(json.createdAt).toLocaleString("fr-FR")
    : new Date().toLocaleString("fr-FR");
  const parts = json.counts
    ? Object.entries(json.counts)
        .map(([table, count]) => `${table} : ${count}`)
        .join(" · ")
    : "";
  return `Sauvegarde terminée le ${when}. Fichier : ${json.fileName ?? "sauvegarde JSON"}. ${json.totalRows ?? 0} élément(s) enregistré(s)${parts ? ` (${parts})` : ""}.`;
}

export function OnedriveAdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  async function runBackup() {
    setBackingUp(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const res = await fetch("/api/backup/run", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        fileName?: string;
        createdAt?: string;
        totalRows?: number;
        counts?: BackupCounts;
      };
      if (!res.ok) {
        setBackupError(json.error || "Sauvegarde impossible.");
        return;
      }
      setBackupMessage(formatBackupMessage(json));
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : "Sauvegarde impossible.",
      );
    } finally {
      setBackingUp(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQueryError(params.get("error"));
    fetch("/api/onedrive/status")
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

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <h2 className="font-serif text-3xl text-stone-900">OneDrive</h2>
      <p className="text-sm text-stone-600">
        Connexion au compte Microsoft personnel de l’atelier (f.vauchel@hotmail.com).
        Les jetons restent côté serveur, jamais dans le navigateur.
      </p>

      {status === null ? (
        <p className="text-sm text-stone-500">Chargement du statut…</p>
      ) : (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          {connected ? (
            <>
              <p className="font-medium">OneDrive est connecté.</p>
              {status.account && (
                <p className="mt-1">Compte : {status.account}</p>
              )}
            </>
          ) : (
            <p className="font-medium">OneDrive n’est pas connecté.</p>
          )}
        </div>
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

      <a
        href="/api/onedrive/login"
        className="inline-flex min-h-11 items-center rounded-lg bg-stone-900 px-4 text-sm font-medium text-white"
      >
        Connecter OneDrive
      </a>

      <div className="border-t border-stone-200 pt-4">
        <h3 className="font-medium text-stone-900">Sauvegarde</h3>
        <p className="mt-1 text-sm text-stone-600">
          Copie JSON de toutes les données dans le dossier OneDrive « Sauvegardes ».
          Un envoi automatique est prévu chaque lundi à 3h (heure UTC) une fois
          déployé sur Vercel.
        </p>
        <button
          type="button"
          disabled={backingUp || !connected}
          onClick={() => void runBackup()}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-medium text-stone-900 disabled:opacity-50"
        >
          {backingUp ? "Sauvegarde en cours…" : "Lancer une sauvegarde maintenant"}
        </button>
        {backupMessage && (
          <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {backupMessage}
          </p>
        )}
        {backupError && (
          <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {backupError}
          </p>
        )}
      </div>
    </section>
  );
}
