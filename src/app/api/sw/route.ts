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
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
