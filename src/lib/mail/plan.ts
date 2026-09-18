import "server-only";
import { COMPANY_SIGN_OFF } from "@/lib/brand";
import { BON_COMMANDE_CC, sendResendTextEmail } from "@/lib/bon-commande/mail";

export const PLAN_A_FAIRE_SUBJECT = "PLAN A FAIRE MIKA MERCI";

export function planMikaEmail(): string {
  const fromEnv = process.env.PLAN_MIKA_EMAIL?.trim();
  if (fromEnv && fromEnv.includes("@")) return fromEnv;
  return "f.vauchel@hotmail.com";
}

export function planPourPlanSubject(): string {
  return PLAN_A_FAIRE_SUBJECT;
}

export function planPourPlanText(input: {
  nomClient: string;
  adresse: string;
  datesLabel: string | null;
  onedriveUrl: string | null;
  ficheUrl: string;
}): string {
  const lines = [
    "Bonjour Mika,",
    "",
    "Un nouveau chantier a été créé, pour le plan.",
    "",
    `Client : ${input.nomClient.trim() || "—"}`,
    `Adresse : ${input.adresse.trim() || "—"}`,
    `Dates estimées : ${input.datesLabel || "non renseignées"}`,
  ];
  if (input.onedriveUrl) {
    lines.push(`Dossier OneDrive : ${input.onedriveUrl}`);
  }
  lines.push("", `Fiche chantier : ${input.ficheUrl}`, "", COMPANY_SIGN_OFF);
  return lines.join("\n");
}

export function planPourPlanHtml(input: {
  nomClient: string;
  adresse: string;
  datesLabel: string | null;
  onedriveUrl: string | null;
  ficheUrl: string;
}): string {
  const onedrive = input.onedriveUrl
    ? `<p>Dossier OneDrive : <a href="${escapeHtml(input.onedriveUrl)}">${escapeHtml(input.onedriveUrl)}</a></p>`
    : "";
  return [
    "<p>Bonjour Mika,</p>",
    "<p>Un nouveau chantier a été créé, pour le plan.</p>",
    `<p>Client : ${escapeHtml(input.nomClient.trim() || "—")}<br/>`,
    `Adresse : ${escapeHtml(input.adresse.trim() || "—")}<br/>`,
    `Dates estimées : ${escapeHtml(input.datesLabel || "non renseignées")}</p>`,
    onedrive,
    `<p><a href="${escapeHtml(input.ficheUrl)}">Ouvrir la fiche du chantier</a></p>`,
    `<p>${COMPANY_SIGN_OFF}</p>`,
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function runPlanMailSelfCheck() {
  if (planPourPlanSubject() !== PLAN_A_FAIRE_SUBJECT) {
    throw new Error("plan-mail: l’objet doit être exactement PLAN A FAIRE MIKA MERCI");
  }
  if (planMikaEmail() !== "f.vauchel@hotmail.com" && !process.env.PLAN_MIKA_EMAIL) {
    throw new Error("plan-mail: destinataire par défaut f.vauchel@hotmail.com");
  }
  const text = planPourPlanText({
    nomClient: "Portail Dupont",
    adresse: "1 rue Test",
    datesLabel: "01/10/2026 → 05/10/2026",
    onedriveUrl: "https://example.com/folder",
    ficheUrl: "https://planning.example/chantiers?fiche=abc",
  });
  if (!text.includes("Portail Dupont") || !text.includes("fiche")) {
    throw new Error("plan-mail: le corps doit citer le chantier et la fiche");
  }
}
runPlanMailSelfCheck();

export async function sendPlanPourMikaEmail(input: {
  nomClient: string;
  adresse: string;
  datesLabel: string | null;
  onedriveUrl: string | null;
  ficheUrl: string;
}): Promise<{ sent: boolean; warning?: string }> {
  try {
    await sendResendTextEmail({
      to: planMikaEmail(),
      cc: BON_COMMANDE_CC,
      subject: PLAN_A_FAIRE_SUBJECT,
      text: planPourPlanText(input),
      html: planPourPlanHtml(input),
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[plan-mail]", message);
    return { sent: false, warning: message };
  }
}
