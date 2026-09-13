import "server-only";
import { sendGraphMail } from "@/lib/onedrive/graph";
import { loadOnedriveTokens } from "@/lib/onedrive/tokens";
import { CATEGORIE_DEMANDE_LABELS, type CategorieDemande } from "@/lib/types";

export const DEFAULT_COMMANDE_MAILBOX = "f.vauchel@hotmail.com";

export const COMMANDE_MAIL_TEMPLATES = [
  {
    id: "nouvelle",
    label: "Nouvelle commande",
    subject: (auteur: string) => `Planning — nouvelle commande de ${auteur}`,
    body: (auteur: string, message: string) =>
      [
        "Nouvelle commande depuis le planning Ferronnerie Vauchel.",
        "",
        `De : ${auteur}`,
        "",
        message,
        "",
        "Ouvrez l’onglet Demandes pour la traiter.",
      ].join("\n"),
  },
  {
    id: "recu",
    label: "Accusé de réception",
    subject: (auteur: string) => `Planning — commande de ${auteur} bien reçue`,
    body: (auteur: string, message: string) =>
      [
        `Nous avons bien reçu la commande de ${auteur}.`,
        "",
        message,
        "",
        "— Ferronnerie Vauchel",
      ].join("\n"),
  },
  {
    id: "en_cours",
    label: "Commande en cours",
    subject: (auteur: string) => `Planning — commande de ${auteur} en cours`,
    body: (auteur: string, message: string) =>
      [
        `La commande de ${auteur} est en cours de traitement.`,
        "",
        message,
        "",
        "— Ferronnerie Vauchel",
      ].join("\n"),
  },
  {
    id: "faite",
    label: "Commande effectuée",
    subject: (auteur: string) => `Planning — commande de ${auteur} effectuée`,
    body: (auteur: string, message: string) =>
      [
        `La commande de ${auteur} a été effectuée.`,
        "",
        message,
        "",
        "— Ferronnerie Vauchel",
      ].join("\n"),
  },
] as const;

export type CommandeMailTemplateId = (typeof COMMANDE_MAIL_TEMPLATES)[number]["id"];

export function commandeMailTemplate(id: string) {
  return COMMANDE_MAIL_TEMPLATES.find((item) => item.id === id) ?? null;
}

export function commandeNotifyEmails(): string[] {
  const raw = process.env.COMMANDE_NOTIFY_EMAILS?.trim();
  if (raw) {
    return raw
      .split(/[,;\s]+/)
      .map((item) => item.trim())
      .filter((item) => item.includes("@"));
  }
  return [DEFAULT_COMMANDE_MAILBOX];
}

export async function sendCommandeMailboxMessage(input: {
  templateId: CommandeMailTemplateId | string;
  auteur: string;
  message: string;
  categorie?: CategorieDemande;
}): Promise<{ sent: boolean; warning?: string }> {
  const template = commandeMailTemplate(input.templateId);
  if (!template) {
    return { sent: false, warning: "Modèle de message inconnu." };
  }
  const tokens = await loadOnedriveTokens();
  if (!tokens) {
    return {
      sent: false,
      warning:
        "Connectez le compte Microsoft (f.vauchel) dans l’onglet OneDrive, en acceptant l’envoi d’e-mails.",
    };
  }
  const to = commandeNotifyEmails();
  const unique = Array.from(new Set(to));
  const categorie =
    input.categorie && CATEGORIE_DEMANDE_LABELS[input.categorie]
      ? CATEGORIE_DEMANDE_LABELS[input.categorie]
      : "Commande";
  try {
    await sendGraphMail({
      to: unique,
      subject: template.subject(input.auteur),
      text: `${categorie}\n\n${template.body(input.auteur, input.message)}`,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[commande-mail]", message);
    return {
      sent: false,
      warning: /Mail\.Send|insufficient|denied|scope/i.test(message)
        ? "Reconnectez OneDrive et acceptez l’autorisation d’envoyer des e-mails."
        : `E-mail non envoyé : ${message}`,
    };
  }
}
