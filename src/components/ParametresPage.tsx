"use client";

import Link from "next/link";
import { AccesDroitsSettings } from "@/components/AccesDroitsSettings";
import { EntrepriseSettingsPage } from "@/components/EntrepriseSettingsPage";
import { SaisonActiveBadge } from "@/components/SaisonActiveBadge";

const AUTRES: { href: string; titre: string; texte: string }[] = [
  {
    href: "/employes",
    titre: "Employés",
    texte: "Salariés, horaires, PIN, admin ou non.",
  },
  {
    href: "/sous-traitants",
    titre: "Sous-traitants",
    texte: "Fiches et planning des sous-traitants.",
  },
  {
    href: "/admin/onedrive",
    titre: "OneDrive",
    texte: "Connexion Hotmail, dossiers clients, envoi des fichiers.",
  },
  {
    href: "/sauvegarde",
    titre: "Sauvegarde",
    texte: "Copies de secours et restauration.",
  },
];

export function ParametresPage() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-serif text-3xl text-stone-900">Paramètres</h2>
        <div className="mt-2">
          <SaisonActiveBadge detail />
        </div>
        <p className="mt-1 text-sm text-stone-600">
          Société et droits d’accès. Les textes d’e-mail des devis se règlent dans Devis →
          Paramètres Devis.
        </p>
      </div>
      <div>
        <h3 className="font-serif text-xl text-stone-900">Autres réglages</h3>
        <p className="mt-1 text-sm text-stone-600">
          Ces écrans existent déjà ; les liens ci-dessous y mènent, sans tout regrouper ici.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {AUTRES.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.href === "/admin/onedrive" ? false : undefined}
              className="rounded-lg border border-stone-200 bg-white p-4 hover:border-stone-400"
            >
              <p className="font-medium text-stone-900">{item.titre}</p>
              <p className="mt-1 text-sm text-stone-600">{item.texte}</p>
            </Link>
          ))}
        </div>
      </div>
      <EntrepriseSettingsPage />
      <AccesDroitsSettings />
    </section>
  );
}
