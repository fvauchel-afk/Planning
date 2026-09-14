"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/session-context";

const STORAGE_ASKED = "vauchel_push_asked_v2";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function saveSubscription(registration: ServiceWorkerRegistration, publicKey: string) {
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Enregistrement de la notification impossible.");
  }
}

export function CommandePushPrompt() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const [status, setStatus] = useState<
    "hidden" | "ask" | "busy" | "ok" | "denied" | "error"
  >("hidden");
  const [error, setError] = useState<string | null>(null);

  const eligible =
    ready && Boolean(session) && pathname !== "/connexion";

  useEffect(() => {
    if (!eligible) {
      setStatus("hidden");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("hidden");
      return;
    }
    if (typeof Notification === "undefined") {
      setStatus("hidden");
      return;
    }

    let cancelled = false;

    async function sync() {
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const vapid = await fetch("/api/push/vapid", { cache: "no-store" });
        if (!vapid.ok) return;
        const data = (await vapid.json()) as { publicKey?: string | null };
        if (!data.publicKey) {
          setStatus("error");
          setError(
            "Notifications non configurées (clés VAPID manquantes sur le serveur).",
          );
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        if (Notification.permission === "granted") {
          await saveSubscription(registration, data.publicKey);
          if (!cancelled) setStatus("ok");
          return;
        }
        const alreadyAsked = window.localStorage.getItem(STORAGE_ASKED) === "1";
        if (alreadyAsked) {
          if (!cancelled) setStatus("ask");
          return;
        }
        window.localStorage.setItem(STORAGE_ASKED, "1");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          if (!cancelled) setStatus(permission === "denied" ? "denied" : "ask");
          return;
        }
        await saveSubscription(registration, data.publicKey);
        if (!cancelled) setStatus("ok");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Notification impossible.");
          setStatus("error");
        }
      }
    }

    const timer = window.setTimeout(() => {
      void sync();
    }, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eligible]);

  async function enable() {
    setStatus("busy");
    setError(null);
    try {
      const vapid = await fetch("/api/push/vapid", { cache: "no-store" });
      const data = (await vapid.json()) as { publicKey?: string | null };
      if (!data.publicKey) {
        throw new Error("Clés de notification absentes sur le serveur.");
      }
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "ask");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      await saveSubscription(registration, data.publicKey);
      setStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notification impossible.");
      setStatus("error");
    }
  }

  const commande = Boolean(session?.canReceiveCommandes);
  if (!eligible || status === "hidden" || status === "ok") return null;

  if (status === "denied") {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-40 mx-auto max-w-lg rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 shadow-lg md:left-auto md:right-6 md:w-96">
        Les notifications sont bloquées dans le navigateur. Autorisez-les
        dans les réglages du site, ou ajoutez l’app à l’écran d’accueil sur iPhone.
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 mx-auto max-w-lg rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg md:left-auto md:right-6 md:w-96">
      <p className="font-medium">
        {commande ? "Notifications commandes" : "Notifications congés"}
      </p>
      <p className="mt-1 text-amber-900">
        {commande
          ? "Pour être prévenu même si l’application est fermée. Sur iPhone, ajoutez d’abord Planning à l’écran d’accueil."
          : "Pour être prévenu quand une demande de congé est acceptée ou refusée. Sur iPhone, ajoutez d’abord Planning à l’écran d’accueil."}
      </p>
      {error ? <p className="mt-1 text-red-800">{error}</p> : null}
      <button
        type="button"
        disabled={status === "busy"}
        onClick={() => void enable()}
        className="mt-2 rounded bg-amber-800 px-3 py-1.5 text-sm text-amber-50 disabled:opacity-60"
      >
        {status === "busy" ? "Activation…" : "Activer les notifications"}
      </button>
    </div>
  );
}
