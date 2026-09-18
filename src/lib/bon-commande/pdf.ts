import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatIsoFr } from "@/lib/dates";
import { FINITION_LAQUAGE_LABELS } from "@/lib/thermolaquage";
import {
  formatQuantiteBonCommande,
  normalizeLignesBonCommande,
  type LigneBonCommande,
} from "@/lib/bon-commande/lignes";
import type { Chantier, PhasePlanning, SousTraitant } from "@/lib/types";
import { COMPANY_NAME_ASCII } from "@/lib/brand";
import { parsePhotoDataUrls, photoDataUrlToBytes } from "@/lib/photos";

export type BonCommandePdfInput = {
  chantier: Chantier;
  lignes: LigneBonCommande[];
  fabrication: PhasePlanning | null;
  sousTraitant: SousTraitant;
  dateDocument: string;
  photos?: string[];
};

function line(text: string, max = 90) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function wrapToWidth(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const value = text.replace(/\s+/g, " ").trim() || "—";
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  const fits = (candidate: string) =>
    font.widthOfTextAtSize(candidate, size) <= maxWidth;

  const flushLong = (chunk: string) => {
    let rest = chunk;
    while (rest && !fits(rest)) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    return rest;
  };

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (fits(next)) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = fits(word) ? word : flushLong(word);
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}

export async function buildBonCommandePdf(
  input: BonCommandePdfInput,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { height } = page.getSize();
  let y = height - 56;

  try {
    const logoPath = path.join(
      process.cwd(),
      "public",
      "logo-metallerie-du-sud.jpg",
    );
    const jpg = await readFile(logoPath);
    const image = await pdf.embedJpg(jpg);
    const logoW = 168;
    const logoH = (image.height / image.width) * logoW;
    page.drawImage(image, {
      x: 48,
      y: height - 44 - logoH,
      width: logoW,
      height: logoH,
    });
    y = height - 56 - logoH;
  } catch {
    page.drawText(COMPANY_NAME_ASCII, {
      x: 48,
      y: height - 68,
      size: 16,
      font: bold,
      color: rgb(0.16, 0.34, 0.56),
    });
    y = height - 110;
  }
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
  y -= 16;
  page.drawText(
    `Couleur RAL : ${line(input.chantier.couleur_ral?.trim() || "Non renseignee")}`,
    { x: 48, y, size: 11, font },
  );
  y -= 16;
  const finitionLabel = input.chantier.finition
    ? FINITION_LAQUAGE_LABELS[input.chantier.finition]
    : "Non renseignee";
  page.drawText(`Finition : ${line(finitionLabel)}`, {
    x: 48,
    y,
    size: 11,
    font,
  });
  y -= 24;
  page.drawText("Pieces", { x: 48, y, size: 13, font: bold });
  y -= 18;
  page.drawText("Qte", { x: 48, y, size: 10, font: bold });
  page.drawText("Descriptif", { x: 92, y, size: 10, font: bold });
  y -= 14;
  const pieces = normalizeLignesBonCommande(input.lignes);
  const qtyX = 48;
  const descX = 92;
  const descWidth = 455;
  const footerY = 56;

  const ensureSpace = (needed: number) => {
    if (y - needed >= footerY) return;
    page.drawText("La Metallerie du Sud — Planning", {
      x: 48,
      y: 48,
      size: 9,
      font,
      color: rgb(0.45, 0.4, 0.35),
    });
    page = pdf.addPage([595.28, 841.89]);
    y = height - 56;
    page.drawText("Pieces (suite)", { x: 48, y, size: 13, font: bold });
    y -= 18;
    page.drawText("Qte", { x: 48, y, size: 10, font: bold });
    page.drawText("Descriptif", { x: 92, y, size: 10, font: bold });
    y -= 14;
  };

  if (!pieces.length) {
    page.drawText("Aucune piece renseignee", { x: 48, y, size: 11, font });
    y -= 16;
  } else {
    for (const piece of pieces) {
      const wrapped = wrapToWidth(piece.descriptif, font, 11, descWidth);
      ensureSpace(wrapped.length * 14);
      page.drawText(formatQuantiteBonCommande(piece.quantite), {
        x: qtyX,
        y,
        size: 11,
        font,
      });
      wrapped.forEach((part, index) => {
        if (index > 0) {
          y -= 14;
          ensureSpace(14);
        }
        page.drawText(part, { x: descX, y, size: 11, font });
      });
      y -= 16;
    }
  }
  if (input.fabrication?.duree_estimee_heures) {
    ensureSpace(16);
    page.drawText(
      `Charge fabrication : ${input.fabrication.duree_estimee_heures} h`,
      { x: 48, y, size: 11, font },
    );
    y -= 16;
  }
  y -= 20;
  ensureSpace(32);
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
  page.drawText("La Metallerie du Sud — Planning", {
    x: 48,
    y: 48,
    size: 9,
    font,
    color: rgb(0.45, 0.4, 0.35),
  });

  const attached = parsePhotoDataUrls(input.photos);
  for (let index = 0; index < attached.length; index += 1) {
    const decoded = photoDataUrlToBytes(attached[index]!);
    if (!decoded) continue;
    let image;
    try {
      image =
        decoded.extension === "png"
          ? await pdf.embedPng(decoded.bytes)
          : await pdf.embedJpg(decoded.bytes);
    } catch {
      continue;
    }
    const photoPage = pdf.addPage([595.28, 841.89]);
    photoPage.drawText(`Photo ${index + 1}`, {
      x: 48,
      y: 800,
      size: 12,
      font: bold,
    });
    const maxW = 499;
    const maxH = 720;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    photoPage.drawImage(image, {
      x: 48,
      y: 780 - h,
      width: w,
      height: h,
    });
  }

  const bytes = await pdf.save();
  const safeClient = input.chantier.nom_client
    .replace(/[^\wÀ-ÿ-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  const fileName = `bon-commande-${safeClient || "chantier"}-${input.dateDocument}.pdf`;
  return { bytes, fileName };
}