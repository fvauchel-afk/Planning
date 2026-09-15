import "server-only";
import { Resend } from "resend";

export const BON_COMMANDE_CC = "f.vauchel@hotmail.com";

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function resendFromAddress(): string {
  return (
    process.env.RESEND_FROM?.trim() ||
    "Ferronnerie Vauchel <commandes@lametalleriedusud.com>"
  );
}

export async function sendResendTextEmail(input: {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Clé Resend absente. Ajoutez RESEND_API_KEY dans les variables Vercel.",
    );
  }
  const resend = new Resend(apiKey);
  const to = input.to.trim();
  const cc = input.cc?.trim();
  const result = await resend.emails.send({
    from: resendFromAddress(),
    to: [to],
    cc: cc && cc.toLowerCase() !== to.toLowerCase() ? [cc] : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  if (result.error) {
    throw new Error(result.error.message || "Envoi Resend impossible.");
  }
}

export async function sendBonCommandeEmail(input: {
  to: string;
  subject: string;
  text: string;
  fileName: string;
  pdfBytes: Uint8Array;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "Clé Resend absente. Ajoutez RESEND_API_KEY dans les variables Vercel.",
    );
  }
  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from: resendFromAddress(),
    to: [input.to],
    cc: [BON_COMMANDE_CC],
    subject: input.subject,
    text: input.text,
    attachments: [
      {
        filename: input.fileName,
        content: Buffer.from(input.pdfBytes).toString("base64"),
      },
    ],
  });
  if (result.error) {
    throw new Error(result.error.message || "Envoi Resend impossible.");
  }
}
