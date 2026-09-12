"use client";

import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/supabase/errors";
import { usePlanning } from "@/lib/planning-context";

export function DatabaseUnavailableGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, databaseUnavailable, refresh } = usePlanning();

  if (loading || !databaseUnavailable) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center shadow-sm"
      >
        <h2 className="font-serif text-2xl text-stone-900">Base indisponible</h2>
        <p className="mt-3 text-base text-stone-800">
          {DATABASE_UNAVAILABLE_MESSAGE}
        </p>
        <p className="mt-2 text-sm text-stone-600">
          Aucune donnée n’est affichée pour éviter de confondre avec le vrai
          planning. Les modifications sont bloquées tant que la connexion n’est
          pas rétablie.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-6 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
