import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatIsoFr } from "@/lib/dates";

export type ReceptionPdfInput = {
  kind: "reception" | "livraison";
  nomClient: string;
  nomElement: string;
  adresse?: string;
  nomSignataire: string;
  nomSalarie?: string;
  dateDocument: string;
  signaturePng?: Uint8Array;
};

function line(text: string, max = 90) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export async function buildReceptionPdf(
  input: ReceptionPdfInput,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  const isLivraison = input.kind === "livraison";
  const title = isLivraison ? "Bon de livraison" : "Réception de chantier";
  let y = height - 64;

  page.drawText("Ferronnerie Vauchel", {
    x: 48,
    y,
    size: 16,
    font: bold,
    color: rgb(0.22, 0.16, 0.08),
  });
  y -= 18;
  page.drawText("La Métallerie du Sud", {
    x: 48,
    y,
    size: 11,
    font,
    color: rgb(0.45, 0.35, 0.2),
  });
  y -= 36;
  page.drawText(title, {
    x: 48,
    y,
    size: 18,
    font: bold,
    color: rgb(0.12, 0.1, 0.08),
  });
  y -= 28;
  page.drawText(`Date : ${formatIsoFr(input.dateDocument)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 18;
  page.drawText(`Client : ${line(input.nomClient)}`, { x: 48, y, size: 11, font });
  y -= 16;
  page.drawText(`Ouvrage : ${line(input.nomElement)}`, { x: 48, y, size: 11, font });
  if (input.adresse?.trim()) {
    y -= 16;
    page.drawText(
      `${isLivraison ? "Livraison" : "Adresse"} : ${line(input.adresse)}`,
      { x: 48, y, size: 11, font },
    );
  }
  if (input.nomSalarie?.trim()) {
    y -= 16;
    page.drawText(`Salarié : ${line(input.nomSalarie)}`, {
      x: 48,
      y,
      size: 11,
      font,
    });
  }
  y -= 16;
  page.drawText(`Signataire : ${line(input.nomSignataire)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 28;
  page.drawText("Signature (simulée)", { x: 48, y, size: 12, font: bold });
  y -= 10;
  page.drawRectangle({
    x: 48,
    y: y - 160,
    width: 500,
    height: 160,
    borderColor: rgb(0.84, 0.83, 0.82),
    borderWidth: 1,
  });
  if (input.signaturePng && input.signaturePng.length > 0) {
    try {
      const image = await pdf.embedPng(input.signaturePng);
      const maxW = 470;
      const maxH = 140;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      page.drawImage(image, {
        x: 63,
        y: y - 150,
        width: w,
        height: h,
      });
    } catch {
      page.drawText("Signature illisible.", {
        x: 63,
        y: y - 80,
        size: 10,
        font,
        color: rgb(0.6, 0.2, 0.2),
      });
    }
  }
  page.drawText(
    "Document interne : signature simulée, non certifiée.",
    {
      x: 48,
      y: 48,
      size: 9,
      font,
      color: rgb(0.45, 0.4, 0.35),
    },
  );

  const bytes = await pdf.save();
  const safeClient = input.nomClient
    .replace(/[^\wÀ-ÿ-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const prefix = isLivraison ? "bon-livraison" : "reception";
  const fileName = `${prefix}-${safeClient || "chantier"}-${input.dateDocument}.pdf`;
  return { bytes, fileName };
}

export function pngDataUrlToBytes(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  const b64 = match ? match[1] : dataUrl;
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
