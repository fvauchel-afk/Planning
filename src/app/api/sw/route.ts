import { appBuildId } from "@/lib/app-build-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const buildId = appBuildId();
  const body = `/* build:${buildId} */
self.addEventListener("install", () => {
  // Wait for the in-app "Mettre à jour" action (SKIP_WAITING).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (data && data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
  }
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Nouvelle commande",
    body: "Ouvrez Demandes pour la traiter.",
    url: "/demandes",
  };
  let payload = fallback;
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || fallback.title,
        body: parsed.body || fallback.body,
        url: parsed.url || fallback.url,
      };
    }
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/demandes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
