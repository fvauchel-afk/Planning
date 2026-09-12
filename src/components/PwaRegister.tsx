"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

const CHECK_MS = 60_000;

export function PwaRegister() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const [updateReady, setUpdateReady] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let knownBuildId: string | null = null;

    function markReady() {
      if (!cancelled) setUpdateReady(true);
    }

    function watchRegistration(reg: ServiceWorkerRegistration) {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) markReady();
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            markReady();
          }
        });
      });
    }

    async function checkBuild() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { buildId?: string };
        const buildId = data.buildId ?? "";
        if (!knownBuildId) {
          knownBuildId = buildId;
          return;
        }
        if (buildId && buildId !== knownBuildId) markReady();
      } catch {
        // ignore offline
      }
    }

    async function setup() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          updateViaCache: "none",
        });
        if (cancelled) return;
        watchRegistration(reg);
        await reg.update();
      } catch {
        // ignore
      }
      await checkBuild();
    }

    void setup();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void registration?.update();
      void checkBuild();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => {
      void registration?.update();
      void checkBuild();
    }, CHECK_MS);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  async function applyUpdate() {
    setReloading(true);
    const reloadOnce = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, {
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
      // fall through to reload
    }
    reloadOnce();
  }

  const showBanner = ready && Boolean(session) && pathname !== "/connexion" && updateReady;

  return showBanner ? (
    <>
      <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-between gap-3 bg-amber-800 px-4 py-3 text-amber-50 shadow-lg">
        <p className="text-sm font-medium">Une nouvelle version est disponible</p>
        <button
          type="button"
          disabled={reloading}
          onClick={() => void applyUpdate()}
          className="shrink-0 rounded bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-900 disabled:opacity-60"
        >
          {reloading ? "Mise à jour…" : "Mettre à jour"}
        </button>
      </div>
      <div className="h-14" aria-hidden />
    </>
  ) : null;
}
