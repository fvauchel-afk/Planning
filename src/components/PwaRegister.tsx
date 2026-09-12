"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";
import { useSession } from "@/lib/auth/session-context";

const CHECK_MS = 30_000;
const STORAGE_BUILD = "vauchel_seen_build";
const STORAGE_CHANGELOG = "vauchel_seen_changelog";
const CLIENT_BUILD = process.env.NEXT_PUBLIC_APP_BUILD_ID || "dev";
const GATE_ROOT_ID = "update-gate-root";

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

export function PwaRegister({
  onLockChange,
}: {
  onLockChange?: (locked: boolean) => void;
}) {
  const pathname = usePathname();
  const { session, ready } = useSession();
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

  const showGate =
    ready && Boolean(session) && pathname !== "/connexion" && pending !== null;

  useEffect(() => {
    onLockChange?.(showGate);
  }, [onLockChange, showGate]);

  useEffect(() => {
    if (!showGate) return;
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    html.classList.add("update-gate-open");
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "relative";
    const focusTimer = window.setTimeout(() => buttonRef.current?.focus(), 30);

    const allow = (target: EventTarget | null) => {
      const node = target as Node | null;
      const root = document.getElementById(GATE_ROOT_ID);
      return Boolean(root && node && root.contains(node));
    };

    const block = (event: Event) => {
      if (allow(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!allow(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        buttonRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        buttonRef.current?.focus();
      }
    };

    const types: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "pointerup",
      "click",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchmove",
      "wheel",
      "scroll",
    ];
    for (const type of types) {
      document.addEventListener(type, block, { capture: true, passive: false });
    }
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", block, { capture: true, passive: false });

    return () => {
      window.clearTimeout(focusTimer);
      html.classList.remove("update-gate-open");
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      for (const type of types) {
        document.removeEventListener(type, block, true);
      }
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", block, true);
    };
  }, [showGate]);

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

  if (!showGate || !mounted) return null;

  return createPortal(
    <div
      id={GATE_ROOT_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-gate-title"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-stone-950/90 p-4"
      style={{ touchAction: "none" }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        style={{ touchAction: "auto" }}
      >
        <h2 id="update-gate-title" className="font-serif text-2xl text-stone-900">
          Une nouvelle version est disponible
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Cliquez sur Mettre à jour pour continuer. Tant que ce n’est pas fait,
          l’application reste bloquée.
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
          ref={buttonRef}
          type="button"
          disabled={reloading}
          onClick={() => void applyUpdate()}
          className="mt-6 w-full rounded-lg bg-amber-700 px-4 py-3 text-base font-semibold text-amber-50 disabled:opacity-60"
        >
          {reloading ? "Mise à jour…" : "Mettre à jour"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
