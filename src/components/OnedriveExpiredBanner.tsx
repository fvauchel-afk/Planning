"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/session-context";

type LiteStatus = {
  connected?: boolean;
  expired?: boolean;
  account?: string | null;
};

export function OnedriveExpiredBanner() {
  const { session, ready } = useSession();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!ready || !session?.isAdmin) return;
    let cancelled = false;
    fetch("/api/onedrive/status?lite=1", { cache: "no-store", redirect: "manual" })
      .then((res) => res.json())
      .then((json: LiteStatus) => {
        if (!cancelled) setExpired(Boolean(json.expired) && !json.connected);
      })
      .catch(() => {
        if (!cancelled) setExpired(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session?.isAdmin, session?.employeeId]);

  if (!expired) return null;

  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-950"
    >
      <p className="font-semibold">OneDrive n’est plus connecté.</p>
      <p className="mt-1">
        Microsoft a coupé l’accès du compte Hotmail de l’atelier. Tant que
        personne ne reclique sur « Connecter OneDrive », les dossiers, devis et
        e-mails Hotmail resteront bloqués.{" "}
        <a className="font-medium underline" href="/admin/onedrive">
          Reconnecter maintenant
        </a>
        .
      </p>
    </div>
  );
}
