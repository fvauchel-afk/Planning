"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { useSession } from "@/lib/auth/session-context";
import { useHasUnsavedWork } from "@/lib/form-draft";

const CHECK_MS = 15_000;
const STORAGE_BUILD = "vauchel_seen_build";
const STORAGE_CHANGELOG = "vauchel_seen_changelog";
const STORAGE_SNOOZE = "vauchel_snooze_build";
const CLIENT_BUILD = process.env.NEXT_PUBLIC_APP_BUILD_ID || "dev";

type VersionPayload = {
  buildId?: string;
  changelog?: ChangelogEntry[];
};

function readSeenChangelog(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_CHANGELOG);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function unseenEntries(changelog: ChangelogEntry[]): ChangelogEntry[] {
  const seen = new Set(readSeenChangelog());
  return changelog.filter((entry) => !seen.has(entry.id));
}

function readSnoozedBuild(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_SNOOZE);
  } catch {
    return null;
  }
}

export function PwaRegister() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const hasUnsaved = useHasUnsavedWork();
  const [pending, setPending] = useState<{
    buildId: string;
    entries: ChangelogEntry[];
  } | null>(null);
  const [reloading, setReloading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    function showUpdate(buildId: string, changelog: ChangelogEntry[]) {
      if (cancelled) return;
      const unseen = unseenEntries(changelog.length ? changelog : CHANGELOG);
      setPending({
        buildId,
        entries: unseen.length
          ? unseen
          : [
              {
                id: "nouvelle-version",
                title: "Nouvelle version",
                items: ["Des améliorations viennent d’être mises en ligne."],
              },
            ],
      });
    }

    async function checkVersion() {
      try {
        const response = await fetch(`/api/version?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Pragma: "no-cache" },
        });
        if (!response.ok) return;
        const data = (await response.json()) as VersionPayload;
        const buildId = data.buildId || CLIENT_BUILD;
        const changelog = data.changelog ?? CHANGELOG;
        const seenBuild = window.localStorage.getItem(STORAGE_BUILD);
        const clientStale =
          CLIENT_BUILD !== "dev" && buildId !== "dev" && CLIENT_BUILD !== buildId;
        const serverNewer = Boolean(!seenBuild || seenBuild !== buildId);
        const unseen = unseenEntries(changelog);
        const waitingSw = Boolean(
          registration?.waiting && navigator.serviceWorker.controller,
        );
        if (readSnoozedBuild() === buildId) return;
        if (serverNewer || clientStale || waitingSw || unseen.length > 0) {
          showUpdate(buildId, changelog);
        }
      } catch {
        // hors ligne : ne pas bloquer
      }
    }

    async function setup() {
      if ("serviceWorker" in navigator) {
        try {
          registration = await navigator.serviceWorker.register("/sw.js", {
            updateViaCache: "none",
          });
          if (registration.waiting && navigator.serviceWorker.controller) {
            const seenBuild = window.localStorage.getItem(STORAGE_BUILD);
            if (seenBuild && readSnoozedBuild() !== CLIENT_BUILD) {
              showUpdate(CLIENT_BUILD, CHANGELOG);
            }
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration?.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                void checkVersion();
              }
            });
          });
          await registration.update();
        } catch {
          // ignore
        }
      }
    }

    void checkVersion();
    void setup();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void registration?.update();
      void checkVersion();
    };
    const onFocus = () => {
      void registration?.update();
      void checkVersion();
    };
    const onPageShow = () => {
      void registration?.update();
      void checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    const interval = window.setInterval(() => {
      void registration?.update();
      void checkVersion();
    }, CHECK_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.clearInterval(interval);
    };
  }, []);

  const loggedIn =
    ready && Boolean(session) && pathname !== "/connexion" && pending !== null;

  async function applyUpdate() {
    if (!pending) return;
    if (hasUnsaved) {
      const ok = window.confirm(
        "Vous avez une modification non enregistrée. Continuer recharge la page ; votre saisie sera remise ensuite.",
      );
      if (!ok) return;
    }
    setReloading(true);
    window.localStorage.setItem(STORAGE_BUILD, pending.buildId);
    window.localStorage.setItem(
      STORAGE_CHANGELOG,
      JSON.stringify(
        Array.from(
          new Set([
            ...readSeenChangelog(),
            ...pending.entries.map((entry) => entry.id),
            ...CHANGELOG.map((entry) => entry.id),
          ]),
        ),
      ),
    );
    const reloadOnce = () => {
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("controllerchange", reloadOnce, {
      once: true,
    });
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(reloadOnce, 800);
        return;
      }
      await reg?.update();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        window.setTimeout(reloadOnce, 800);
        return;
      }
    } catch {
      // fall through
    }
    reloadOnce();
  }

  function snooze() {
    if (!pending) return;
    try {
      window.sessionStorage.setItem(STORAGE_SNOOZE, pending.buildId);
    } catch {
      // ignore
    }
    setPending(null);
  }

  if (!mounted || !loggedIn || !pending) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center p-3"
      role="status"
    >
      <div className="pointer-events-auto max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
        <h2 className="font-serif text-lg text-stone-900">
          Une nouvelle version est disponible
        </h2>
        <p className="mt-1 text-sm text-stone-700">
          Cliquez sur Mettre à jour pour l’appliquer. Vous pouvez continuer à
          travailler : la session en cours n’est pas coupée tant que vous n’avez
          pas mis à jour.
          {hasUnsaved
            ? " Une fiche est ouverte : votre saisie sera remise si vous mettez à jour maintenant."
            : ""}
        </p>
        <div className="mt-3 space-y-3">
          {pending.entries.map((entry) => (
            <div key={entry.id}>
              <h3 className="text-sm font-semibold text-stone-800">{entry.title}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-stone-700">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            ref={buttonRef}
            type="button"
            disabled={reloading}
            onClick={() => void applyUpdate()}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-amber-50 disabled:opacity-60"
          >
            {reloading ? "Mise à jour…" : "Mettre à jour"}
          </button>
          <button
            type="button"
            disabled={reloading}
            onClick={snooze}
            className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm text-amber-950 disabled:opacity-60"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
