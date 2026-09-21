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

type CatchUp = {
  folders: number;
  devis: number;
  remainingFolders: number;
  remainingDevis: number;
  errors: string[];
  skipped?: boolean;
};

export function OnedriveAdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [catchUp, setCatchUp] = useState<CatchUp | null>(null);
  const [catchUpBusy, setCatchUpBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQueryError(params.get("error"));
    setJustConnected(params.get("connected") === "1");
    fetch("/api/onedrive/status", { cache: "no-store", redirect: "manual" })
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

  useEffect(() => {
    if (!justConnected || !status?.connected) return;
    let cancelled = false;
    setCatchUpBusy(true);
    const totals: CatchUp = {
      folders: 0,
      devis: 0,
      remainingFolders: 0,
      remainingDevis: 0,
      errors: [],
    };
    void (async () => {
      for (let step = 0; step < 8; step += 1) {
        const res = await fetch("/api/onedrive/catch-up", {
          method: "POST",
          cache: "no-store",
          redirect: "manual",
        });
        const json = (await res.json().catch(() => ({}))) as CatchUp;
        totals.folders += Number(json.folders) || 0;
        totals.devis += Number(json.devis) || 0;
        totals.remainingFolders = Number(json.remainingFolders) || 0;
        totals.remainingDevis = Number(json.remainingDevis) || 0;
        totals.skipped = json.skipped;
        for (const message of json.errors ?? []) {
          if (!totals.errors.includes(message)) totals.errors.push(message);
        }
        if (cancelled) return;
        setCatchUp({ ...totals, errors: totals.errors.slice(0, 8) });
        if (json.skipped) break;
        if (
          (Number(json.folders) || 0) === 0 &&
          (Number(json.devis) || 0) === 0
        ) {
          break;
        }
        if (
          totals.remainingFolders === 0 &&
          totals.remainingDevis === 0
        ) {
          break;
        }
      }
      if (!cancelled) setCatchUpBusy(false);
    })().catch(() => {
      if (!cancelled) {
        setCatchUpBusy(false);
        setCatchUp({
          folders: 0,
          devis: 0,
          remainingFolders: 0,
          remainingDevis: 0,
          errors: ["Rattrapage OneDrive impossible."],
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [justConnected, status?.connected]);

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
                  "Microsoft a révoqué le jeton Hotmail. Le planning ne peut pas le réparer tout seul : il faut cliquer sur « Connecter OneDrive » (connexion Microsoft, une fois)."}
              </p>
              <p className="mt-2 text-amber-900">
                Un compte Microsoft personnel (Hotmail) n’est jamais « toujours
                connecté » à 100 % : mot de passe changé, sécurité Microsoft, ou
                jeton trop longtemps inutilisé. Le planning rafraîchit le jeton
                à chaque entrée, mais si Microsoft le refuse, seule une action
                humaine débloque.
              </p>
            </>
          ) : (
            <p className="font-medium">OneDrive n’est pas connecté.</p>
          )}
        </div>
      )}

      {justConnected && status?.connected ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          {catchUpBusy && !catchUp ? (
            <p>Rattrapage des dossiers et devis manquants…</p>
          ) : catchUpBusy ? (
            <p>
              Rattrapage en cours : {catchUp?.folders ?? 0} dossier
              {(catchUp?.folders ?? 0) > 1 ? "s" : ""}, {catchUp?.devis ?? 0}{" "}
              devis.
            </p>
          ) : (
            <p>
              Rattrapage terminé : {catchUp?.folders ?? 0} dossier
              {(catchUp?.folders ?? 0) > 1 ? "s" : ""} créé
              {(catchUp?.folders ?? 0) > 1 ? "s" : ""} ou lié
              {(catchUp?.folders ?? 0) > 1 ? "s" : ""}, {catchUp?.devis ?? 0}{" "}
              devis copié
              {(catchUp?.devis ?? 0) > 1 ? "s" : ""}.
              {(catchUp?.remainingFolders ?? 0) > 0 ||
              (catchUp?.remainingDevis ?? 0) > 0
                ? " Il en reste : recliquez « Connecter OneDrive » pour continuer."
                : ""}
            </p>
          )}
          {catchUp?.errors?.length ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950">
              {catchUp.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

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
