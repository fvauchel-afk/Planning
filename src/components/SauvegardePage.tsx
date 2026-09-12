"use client";

import { useEffect, useState } from "react";
import { CHANGELOG } from "@/data/changelog";
import { RESTORE_CONFIRM_PHRASE } from "@/lib/auth/restore-access";
import { useSession } from "@/lib/auth/session-context";

type BackupFile = {
  id: string;
  name: string;
  createdAt: string;
  lastModifiedAt: string;
  size: number;
  webUrl?: string;
  kindLabel?: string;
  trigger?: string | null;
  changelogTitle?: string | null;
};

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

export function SauvegardePage() {
  const { session, ready } = useSession();
  const canRestore = Boolean(session?.canRestore);
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "warn" | "confirm">("pick");
  const [understood, setUnderstood] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  async function loadList() {
    setListError(null);
    try {
      const res = await fetch("/api/backup/list");
      const json = (await res.json()) as { files?: BackupFile[]; error?: string };
      if (!res.ok) {
        setListError(json.error || "Impossible de lister les sauvegardes.");
        setFiles([]);
        return;
      }
      setFiles(json.files ?? []);
    } catch {
      setListError("Impossible de lister les sauvegardes.");
      setFiles([]);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  async function runBackup() {
    setBackingUp(true);
    setBackupMessage(null);
    setBackupError(null);
    try {
      const res = await fetch("/api/backup/run", { method: "POST" });
      const json = (await res.json()) as {
        error?: string;
        fileName?: string;
        createdAt?: string;
      };
      if (!res.ok) {
        setBackupError(json.error || "Sauvegarde impossible.");
        return;
      }
      const when = json.createdAt
        ? new Date(json.createdAt).toLocaleString("fr-FR")
        : "";
      setBackupMessage(
        `Sauvegarde enregistrée${when ? ` le ${when}` : ""} (${json.fileName ?? "fichier JSON"}).`,
      );
      await loadList();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Sauvegarde impossible.");
    } finally {
      setBackingUp(false);
    }
  }

  function resetRestoreUi() {
    setStep("pick");
    setUnderstood(false);
    setPhrase("");
    setRestoreError(null);
  }

  async function confirmRestore() {
    if (!selectedId || phrase !== RESTORE_CONFIRM_PHRASE || !understood) return;
    setRestoring(true);
    setRestoreError(null);
    setRestoreMessage(null);
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedId,
          confirm: RESTORE_CONFIRM_PHRASE,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRestoreError(json.error || "Restauration impossible.");
        return;
      }
      setRestoreMessage(
        "Les données ont été remplacées par la sauvegarde choisie. Rechargez le planning.",
      );
      resetRestoreUi();
    } catch (err) {
      setRestoreError(
        err instanceof Error ? err.message : "Restauration impossible.",
      );
    } finally {
      setRestoring(false);
    }
  }

  const selected = files?.find((file) => file.id === selectedId) ?? null;

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Sauvegarde</h2>
        <p className="mt-1 text-sm text-stone-600">
          Copie quotidienne des chantiers, phases, absences et salariés dans le
          dossier OneDrive « Sauvegarde ». Les suppressions dans l’application
          (bouton Supprimer) restent possibles ; rien n’est effacé tout seul
          lors d’une mise à jour.
        </p>
      </div>

      <div className="rounded-lg border border-stone-300 bg-white p-4">
        <h3 className="font-medium text-stone-900">Sauvegarde manuelle</h3>
        <p className="mt-1 text-sm text-stone-600">
          En plus de la copie automatique chaque nuit, vous pouvez en lancer une
          maintenant.
        </p>
        <button
          type="button"
          disabled={backingUp}
          onClick={() => void runBackup()}
          className="mt-3 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-amber-50 disabled:opacity-60"
        >
          {backingUp ? "Sauvegarde…" : "Lancer une sauvegarde maintenant"}
        </button>
        {backupMessage && (
          <p className="mt-3 text-sm text-emerald-800">{backupMessage}</p>
        )}
        {backupError && (
          <p className="mt-3 text-sm text-red-800">{backupError}</p>
        )}
      </div>

      <div className="rounded-lg border border-stone-300 bg-white p-4">
        <h3 className="font-medium text-stone-900">Sauvegardes enregistrées</h3>
        {files === null ? (
          <p className="mt-2 text-sm text-stone-500">Chargement…</p>
        ) : listError ? (
          <p className="mt-2 text-sm text-red-800">{listError}</p>
        ) : files.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">
            Aucune sauvegarde pour l’instant. Connectez OneDrive puis lancez-en
            une, ou attendez la copie de la nuit.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200">
            {files.map((file) => (
              <li key={file.id} className="flex items-start gap-3 py-2">
                {canRestore ? (
                  <input
                    type="radio"
                    name="backup"
                    checked={selectedId === file.id}
                    onChange={() => {
                      setSelectedId(file.id);
                      resetRestoreUi();
                    }}
                    className="mt-1"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900">
                    {formatWhen(file.createdAt || file.lastModifiedAt)}
                  </p>
                  <p className="text-sm text-stone-700">
                    {file.kindLabel ?? "Sauvegarde"}
                  </p>
                  <p className="truncate text-xs text-stone-500">{file.name}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {ready && !canRestore ? (
          <p className="mt-4 text-sm text-stone-500">
            La restauration n’est possible que pour Jonathan et Mika.
          </p>
        ) : null}
        {canRestore && files && files.length > 0 ? (
          <div className="mt-4 border-t border-stone-200 pt-4">
            {step === "pick" && (
              <button
                type="button"
                disabled={!selectedId}
                onClick={() => setStep("warn")}
                className="rounded-lg border border-red-700 px-4 py-2 text-sm font-medium text-red-800 disabled:opacity-50"
              >
                Restaurer la sauvegarde sélectionnée…
              </button>
            )}
            {step === "warn" && selected && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <p className="font-medium">Attention : action irréversible</p>
                <p>
                  Cette action va <strong>remplacer toutes les données actuelles</strong>{" "}
                  (chantiers, planning, absences, salariés) par le contenu de la
                  sauvegarde du{" "}
                  <strong>{formatWhen(selected.createdAt || selected.lastModifiedAt)}</strong>.
                  Ce qui a été saisi depuis cette date sera perdu, sauf s’il
                  existe une sauvegarde plus récente.
                </p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={understood}
                    onChange={(event) => setUnderstood(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Je comprends que les données actuelles seront remplacées.
                  </span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetRestoreUi}
                    className="rounded border border-stone-300 bg-white px-3 py-2"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={!understood}
                    onClick={() => setStep("confirm")}
                    className="rounded bg-red-700 px-3 py-2 font-medium text-white disabled:opacity-50"
                  >
                    Continuer
                  </button>
                </div>
              </div>
            )}
            {step === "confirm" && (
              <div className="space-y-3 rounded-lg border border-red-300 bg-white p-4 text-sm">
                <p className="font-medium text-red-900">
                  Dernière confirmation
                </p>
                <p className="text-stone-700">
                  Tapez <strong>{RESTORE_CONFIRM_PHRASE}</strong> puis cliquez
                  sur le bouton rouge. Un simple clic ne suffit pas.
                </p>
                <input
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2"
                  autoComplete="off"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetRestoreUi}
                    className="rounded border border-stone-300 px-3 py-2"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={
                      restoring || phrase !== RESTORE_CONFIRM_PHRASE || !understood
                    }
                    onClick={() => void confirmRestore()}
                    className="rounded bg-red-800 px-3 py-2 font-medium text-white disabled:opacity-50"
                  >
                    {restoring
                      ? "Restauration…"
                      : "Oui, remplacer les données actuelles"}
                  </button>
                </div>
              </div>
            )}
            {restoreMessage && (
              <p className="mt-3 text-sm text-emerald-800">{restoreMessage}</p>
            )}
            {restoreError && (
              <p className="mt-3 text-sm text-red-800">{restoreError}</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-stone-300 bg-white p-4">
        <h3 className="font-medium text-stone-900">Dernières mises à jour</h3>
        <p className="mt-1 text-sm text-stone-600">
          Ce qui a changé dans l’application, en langage simple.
        </p>
        <div className="mt-4 space-y-4">
          {CHANGELOG.map((entry) => (
            <div key={entry.id}>
              <h4 className="text-sm font-semibold text-stone-800">
                {entry.title}
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
