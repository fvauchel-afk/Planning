"use client";

import { useSession } from "@/lib/auth/session-context";

export function firstNameFromNom(nom: string): string {
  const cleaned = nom.replace(/\([^)]*\)/g, " ").trim();
  return cleaned.split(/\s+/)[0] || nom.trim();
}

export function WelcomeBanner() {
  const { session } = useSession();
  if (!session?.nom) return null;
  const prenom = firstNameFromNom(session.nom);
  return (
    <p className="mb-1 font-serif text-lg text-stone-800 md:text-xl">
      Bienvenue à toi Jeune {prenom}
    </p>
  );
}
