import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatIsoFr } from "@/lib/dates";
import type { Chantier, ElementChantier, PhasePlanning, SousTraitant } from "@/lib/types";

export type BonCommandePdfInput = {
  chantier: Chantier;
  elements: ElementChantier[];
  fabrication: PhasePlanning | null;
  sousTraitant: SousTraitant;
  dateDocument: string;
};

function line(text: string, max = 90) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export async function buildBonCommandePdf(
  input: BonCommandePdfInput,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  let y = height - 56;

  try {
    const iconPath = path.join(process.cwd(), "public", "icon-192.png");
    const png = await readFile(iconPath);
    const image = await pdf.embedPng(png);
    page.drawImage(image, { x: 48, y: height - 96, width: 40, height: 40 });
  } catch {
    // logo optionnel
  }

  page.drawText("Ferronnerie Vauchel", {
    x: 100,
    y: height - 68,
    size: 16,
    font: bold,
    color: rgb(0.22, 0.16, 0.08),
  });
  page.drawText("La Metallerie du Sud", {
    x: 100,
    y: height - 86,
    size: 11,
    font,
    color: rgb(0.45, 0.35, 0.2),
  });

  y = height - 130;
  page.drawText("Bon de commande sous-traitance", {
    x: 48,
    y,
    size: 18,
    font: bold,
    color: rgb(0.12, 0.1, 0.08),
  });
  y -= 28;
  page.drawText(`Date (depart fabrication prevu) : ${formatIsoFr(input.dateDocument)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 22;
  page.drawText(`Sous-traitant : ${line(input.sousTraitant.nom)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 16;
  page.drawText(`Specialite : ${line(input.sousTraitant.specialite)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 16;
  page.drawText(`Email : ${line(input.sousTraitant.email)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  if (input.sousTraitant.telephone?.trim()) {
    y -= 16;
    page.drawText(`Telephone : ${line(input.sousTraitant.telephone)}`, {
      x: 48,
      y,
      size: 11,
      font,
    });
  }
  y -= 28;
  page.drawText("Chantier", { x: 48, y, size: 13, font: bold });
  y -= 20;
  page.drawText(`Client : ${line(input.chantier.nom_client)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 16;
  page.drawText(
    `Adresse : ${line(input.chantier.adresse || "Non renseignee")}`,
    { x: 48, y, size: 11, font },
  );
  y -= 24;
  page.drawText("Ouvrages / description", { x: 48, y, size: 13, font: bold });
  y -= 20;
  const description =
    input.elements.map((item) => item.nom_element).filter(Boolean).join(", ") ||
    "Non renseigne";
  page.drawText(line(description, 92), { x: 48, y, size: 11, font });
  if (input.fabrication?.duree_estimee_heures) {
    y -= 16;
    page.drawText(
      `Charge fabrication : ${input.fabrication.duree_estimee_heures} h`,
      { x: 48, y, size: 11, font },
    );
  }
  y -= 36;
  page.drawText(
    "Merci de traiter cette commande selon le delai habituel de 5 jours ouvres",
    { x: 48, y, size: 10, font, color: rgb(0.25, 0.22, 0.18) },
  );
  y -= 14;
  page.drawText("a compter de la reception de ce bon.", {
    x: 48,
    y,
    size: 10,
    font,
    color: rgb(0.25, 0.22, 0.18),
  });
  page.drawText("Ferronnerie Vauchel — Planning", {
    x: 48,
    y: 48,
    size: 9,
    font,
    color: rgb(0.45, 0.4, 0.35),
  });

  const bytes = await pdf.save();
  const safeClient = input.chantier.nom_client
    .replace(/[^\wÀ-ÿ-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const fileName = `bon-commande-${safeClient || "chantier"}-${input.dateDocument}.pdf`;
  return { bytes, fileName };
}