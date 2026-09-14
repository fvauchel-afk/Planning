import "server-only";
import { waitUntil } from "@vercel/functions";
import { refreshOnedriveQuietly } from "@/lib/onedrive/tokens";

/** Démarre le rafraîchissement OneDrive sans attendre la fin, sans bloquer le login. */
export function scheduleOnedriveKeepalive(): void {
  const run = refreshOnedriveQuietly().catch(() => undefined);
  try {
    waitUntil(run);
  } catch {
    void run;
  }
}
