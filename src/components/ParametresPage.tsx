"use client";

import { AccesDroitsSettings } from "@/components/AccesDroitsSettings";
import { EntrepriseSettingsPage } from "@/components/EntrepriseSettingsPage";

export function ParametresPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Paramètres</h2>
        <p className="mt-1 text-sm text-stone-600">
          Société et droits d’accès. Les textes d’e-mail des devis se règlent dans Devis →
          Paramètres Devis.
        </p>
      </div>
      <EntrepriseSettingsPage />
      <AccesDroitsSettings />
    </section>
  );
}
