import { formatIsoFr } from "@/lib/dates";
import type { ClientFiche, Devis, EntrepriseReglages } from "@/lib/devis/types";

export type MailVars = Record<string, string>;

export function devisMailVars(input: {
  devis: Devis;
  client: ClientFiche;
  entreprise: EntrepriseReglages;
}): MailVars {
  const objet = input.devis.objet.trim();
  return {
    "{{client}}": input.client.nom.trim() || "Client",
    "{{numero}}": String(input.devis.numero),
    "{{société}}": input.entreprise.nom.trim() || "La Métallerie du Sud",
    "{{telephone}}": input.entreprise.telephone.trim() || input.client.telephone?.trim() || "",
    "{{téléphone}}": input.entreprise.telephone.trim() || "",
    "{{objet}}": objet ? ` — ${objet}` : "",
    "{{date}}": formatIsoFr(input.devis.date_emission),
    "{{validité}}": String(input.devis.validite_jours),
    "{{iban}}": input.entreprise.iban.trim() || "—",
    "{{email}}": input.entreprise.email.trim() || "f.vauchel@hotmail.com",
  };
}

export function applyMailVars(template: string, vars: MailVars): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(key).join(value);
  }
  return out;
}
