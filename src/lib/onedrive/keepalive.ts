import "server-only";
import { waitUntil } from "@vercel/functions";
import { refreshOnedriveQuietly } from "@/lib/onedrive/tokens";

/** Démarre le rafraîchissement OneDrive sans attendre la fin. */
export function scheduleOnedriveKeepalive(): void {
  waitUntil(refreshOnedriveQuietly());
}
