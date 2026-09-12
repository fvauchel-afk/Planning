"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { useSession } from "@/lib/auth/session-context";

const CHECK_MS = 30_000;
const STORAGE_BUILD = "vauchel_seen_build";
const STORAGE_CHANGELOG = "vauchel_seen_changelog";
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

export function PwaRegister() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const [pending, setPending] = useState<{
    buildId: string;
    entries: ChangelogEntry[];
  } | null>(null);
  const [reloading, setReloading] = useState(false);

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
        const response = await fetch("/api/version", { cache: "no-store" });
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
            if (seenBuild) showUpdate(CLIENT_BUILD, CHANGELOG);
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
      await checkVersion();
    }

    void setup();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void registration?.update();
      void checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      void registration?.update();
      void checkVersion();
    }, CHECK_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pending]);

  async function applyUpdate() {
    if (!pending) return;
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

  const showGate =
    ready && Boolean(session) && pathname !== "/connexion" && pending !== null;

  if (!showGate) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-gate-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-stone-950/80 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="update-gate-title" className="font-serif text-2xl text-stone-900">
          Une nouvelle version est disponible
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Cliquez sur Mettre à jour pour continuer. L’application se recharge
          avec la dernière version.
        </p>
        <div className="mt-4 space-y-4">
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
        <button
          type="button"
          disabled={reloading}
          onClick={() => void applyUpdate()}
          className="mt-6 w-full rounded-lg bg-amber-700 px-4 py-3 text-base font-semibold text-amber-50 disabled:opacity-60"
        >
          {reloading ? "Mise à jour…" : "Mettre à jour"}
        </button>
      </div>
    </div>
  );
}
