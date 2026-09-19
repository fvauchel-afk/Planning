import "server-only";
import { BON_COMMANDE_CC, sendBonCommandeEmail } from "@/lib/bon-commande/mail";
import { COMPANY_NAME, COMPANY_SIGN_OFF } from "@/lib/brand";
import { formatIsoFr } from "@/lib/dates";
import { formatMontantFr, totauxDevis } from "@/lib/devis/lignes";
import type { ClientFiche, Devis } from "@/lib/devis/types";

export { BON_COMMANDE_CC as DEVIS_MAIL_CC };

export function devisMailPreview(input: {
  devis: Devis;
  client: ClientFiche;
}): { to: string; cc: string; subject: string; text: string } {
  const to = input.client.email?.trim() || "";
  const totaux = totauxDevis(input.devis.lignes, input.devis.tva_pct);
  const subject = `Devis ${input.devis.numero} — ${COMPANY_NAME}`;
  const text = [
    `Bonjour${input.client.nom ? ` ${input.client.nom}` : ""},`,
    "",
    `Veuillez trouver ci-joint le devis ${input.devis.numero}${
      input.devis.objet ? ` — ${input.devis.objet}` : ""
    }.`,
    `Montant TTC : ${formatMontantFr(totaux.ttc)} EUR (TVA ${input.devis.tva_pct} %).`,
    `Date : ${formatIsoFr(input.devis.date_devis)} · Valable ${input.devis.validite_jours} jours.`,
    "",
    "Restant à votre disposition.",
    COMPANY_SIGN_OFF,
  ].join("\n");
  return { to, cc: BON_COMMANDE_CC, subject, text };
}

export async function sendDevisEmail(input: {
  to: string;
  subject: string;
  text: string;
  fileName: string;
  pdfBytes: Uint8Array;
}): Promise<void> {
  await sendBonCommandeEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    fileName: input.fileName,
    pdfBytes: input.pdfBytes,
  });
}
