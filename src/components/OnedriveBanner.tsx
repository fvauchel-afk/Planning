"use client";

import { usePlanning } from "@/lib/planning-context";

export function OnedriveBanner() {
  const { snapshot } = usePlanning();
  const failed = (snapshot.receptions ?? []).filter((row) => row.onedrive_erreur);

  if (failed.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        Envoi OneDrive impossible pour {failed.length} réception
        {failed.length > 1 ? "s" : ""}. La signature est bien enregistrée : déposez
        le fichier PNG à la main dans le dossier client, puis reconnectez OneDrive
        si besoin ({" "}
        <a className="underline" href="/admin/onedrive">
          /admin/onedrive
        </a>
        ).
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {failed.slice(0, 5).map((row) => (
          <li key={row.id}>{row.onedrive_erreur}</li>
        ))}
      </ul>
    </div>
  );
}
