import "server-only";
import { COMPANY_SIGN_OFF } from "@/lib/brand";
import { sendResendTextEmail } from "@/lib/bon-commande/mail";
import { normalizePersonName } from "@/lib/auth/restore-access";
import type { LancementMailCible } from "@/lib/engine/lancement-mail";

function emailMap(): Record<string, string> {
  const raw = process.env.EMPLOYEE_EMAILS?.trim() || process.env.LANCEMENT_EMAILS?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.includes("@")) {
        out[normalizePersonName(key)] = value.trim();
        out[key.trim()] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function emailForEmployee(input: {
  id: string;
  nom: string;
}): string | null {
  const map = emailMap();
  const byId = map[input.id];
  if (byId) return byId;
  const byName = map[normalizePersonName(input.nom)];
  if (byName) return byName;
  return null;
}

export async function sendLancementReminderEmail(
  cible: LancementMailCible,
  ficheUrl: string,
): Promise<{ sent: boolean; skipped?: string }> {
  const to = emailForEmployee({
    id: cible.employeId,
    nom: cible.employeNom,
  });
  if (!to) return { sent: false, skipped: "sans-email" };
  const dateFr = cible.dateDebut.split("-").reverse().join("/");
  const text = [
    `Bonjour ${cible.employeNom},`,
    "",
    `La fabrication de « ${cible.nomClient} » démarre aujourd’hui (${dateFr}) et le lancement n’est pas encore validé.`,
    "",
    "Merci de cliquer « Chantier lancé » sur le planning, ou d’ouvrir la fiche :",
    ficheUrl,
    "",
    COMPANY_SIGN_OFF,
  ].join("\n");
  await sendResendTextEmail({
    to,
    subject: `Lancement fabrication à valider — ${cible.nomClient}`,
    text,
  });
  return { sent: true };
}
