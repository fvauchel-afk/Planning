import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { COMPANY_NAME_ASCII } from "@/lib/brand";
import { addDays, formatIsoFr } from "@/lib/dates";
import {
  formatMontantFr,
  ligneMontantHt,
  totauxDevis,
  type LigneDevis,
} from "@/lib/devis/lignes";
import { adresseClientLignes, type ClientFiche, type Devis } from "@/lib/devis/types";

function pdfSafe(text: string): string {
  return text
    .replace(/€/g, "EUR")
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“|”/g, '"')
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/à/g, "a")
    .replace(/À/g, "A")
    .replace(/â/g, "a")
    .replace(/Â/g, "A")
    .replace(/ä/g, "a")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/é/g, "e")
    .replace(/è/g, "e")
    .replace(/ê/g, "e")
    .replace(/ë/g, "e")
    .replace(/É/g, "E")
    .replace(/È/g, "E")
    .replace(/Ê/g, "E")
    .replace(/î/g, "i")
    .replace(/ï/g, "i")
    .replace(/ô/g, "o")
    .replace(/ù/g, "u")
    .replace(/û/g, "u")
    .replace(/ü/g, "u")
    .replace(/²/g, "2")
    .replace(/\u00a0/g, " ");
}

function wrapToWidth(
  text: string,
  font: { widthOfTextAtSize: (value: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const value = pdfSafe(text).replace(/\s+/g, " ").trim() || "-";
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  const fits = (candidate: string) => font.widthOfTextAtSize(candidate, size) <= maxWidth;
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (fits(next)) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (current && !fits(current)) {
      let cut = current.length - 1;
      while (cut > 1 && !fits(current.slice(0, cut))) cut -= 1;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function montantPdf(n: number): string {
  return `${pdfSafe(formatMontantFr(n))} EUR`;
}

export async function buildDevisPdf(input: {
  devis: Devis;
  client: ClientFiche;
}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  let page = pdf.addPage(pageSize);
  const { height, width } = page.getSize();
  const left = 48;
  const right = width - 48;
  let y = height - 52;

  const newPage = () => {
    page = pdf.addPage(pageSize);
    y = height - 52;
  };
  const ensure = (need: number) => {
    if (y - need < 64) newPage();
  };

  try {
    const logoPath = path.join(process.cwd(), "public", "logo-metallerie-du-sud.jpg");
    const jpg = await readFile(logoPath);
    const image = await pdf.embedJpg(jpg);
    const logoW = 150;
    const logoH = (image.height / image.width) * logoW;
    page.drawImage(image, {
      x: left,
      y: height - 40 - logoH,
      width: logoW,
      height: logoH,
    });
    y = height - 48 - logoH;
  } catch {
    page.drawText(COMPANY_NAME_ASCII, {
      x: left,
      y: height - 64,
      size: 16,
      font: bold,
      color: rgb(0.16, 0.34, 0.56),
    });
    y = height - 88;
  }

  page.drawText("DEVIS", {
    x: right - bold.widthOfTextAtSize("DEVIS", 20),
    y: height - 64,
    size: 20,
    font: bold,
    color: rgb(0.12, 0.1, 0.08),
  });

  const numero = pdfSafe(input.devis.numero);
  page.drawText(numero, {
    x: right - bold.widthOfTextAtSize(numero, 11),
    y: height - 82,
    size: 11,
    font: bold,
  });

  y -= 8;
  page.drawText(pdfSafe(`Date : ${formatIsoFr(input.devis.date_devis)}`), {
    x: left,
    y,
    size: 10,
    font,
  });
  y -= 14;
  const validite = addDays(input.devis.date_devis, input.devis.validite_jours);
  page.drawText(
    pdfSafe(
      `Valable jusqu'au ${formatIsoFr(validite)} (${input.devis.validite_jours} jours)`,
    ),
    { x: left, y, size: 10, font },
  );
  y -= 22;

  page.drawText("Client", {
    x: left,
    y,
    size: 11,
    font: bold,
  });
  y -= 14;
  for (const line of adresseClientLignes(input.client)) {
    page.drawText(pdfSafe(line), { x: left, y, size: 10, font });
    y -= 13;
  }
  if (input.client.email?.trim()) {
    page.drawText(pdfSafe(input.client.email.trim()), { x: left, y, size: 10, font });
    y -= 13;
  }
  if (input.client.telephone?.trim()) {
    page.drawText(pdfSafe(`Tel. ${input.client.telephone.trim()}`), {
      x: left,
      y,
      size: 10,
      font,
    });
    y -= 13;
  }
  y -= 8;
  if (input.devis.objet.trim()) {
    const objetLines = wrapToWidth(`Objet : ${input.devis.objet.trim()}`, font, 11, right - left);
    for (const line of objetLines) {
      ensure(16);
      page.drawText(line, { x: left, y, size: 11, font: bold });
      y -= 14;
    }
    y -= 4;
  }

  const cols = {
    qty: left,
    unite: left + 42,
    des: left + 78,
    pu: right - 170,
    tot: right - 80,
  };
  const desWidth = cols.pu - cols.des - 8;

  const header = () => {
    ensure(28);
    page.drawRectangle({
      x: left,
      y: y - 4,
      width: right - left,
      height: 18,
      color: rgb(0.93, 0.91, 0.88),
    });
    page.drawText("Qte", { x: cols.qty, y, size: 9, font: bold });
    page.drawText("Un", { x: cols.unite, y, size: 9, font: bold });
    page.drawText("Designation", { x: cols.des, y, size: 9, font: bold });
    page.drawText("PU HT", { x: cols.pu, y, size: 9, font: bold });
    page.drawText("Total HT", { x: cols.tot, y, size: 9, font: bold });
    y -= 20;
  };
  header();

  const drawLigne = (row: LigneDevis) => {
    const desLines = wrapToWidth(row.designation || "-", font, 9, desWidth);
    const rowH = Math.max(16, desLines.length * 12);
    ensure(rowH + 4);
    page.drawText(pdfSafe(String(row.quantite)), { x: cols.qty, y, size: 9, font });
    page.drawText(pdfSafe(row.unite), { x: cols.unite, y, size: 9, font });
    desLines.forEach((line, i) => {
      page.drawText(line, { x: cols.des, y: y - i * 12, size: 9, font });
    });
    const pu = montantPdf(row.prix_unitaire_ht);
    const tot = montantPdf(ligneMontantHt(row));
    page.drawText(pu, {
      x: cols.pu,
      y,
      size: 9,
      font,
    });
    page.drawText(tot, { x: cols.tot, y, size: 9, font });
    y -= rowH;
  };

  const lignes = input.devis.lignes.length
    ? input.devis.lignes
    : [{ designation: "(aucune ligne)", quantite: 0, unite: "-", prix_unitaire_ht: 0 }];
  for (const row of lignes) drawLigne(row);

  const totaux = totauxDevis(input.devis.lignes, input.devis.tva_pct);
  y -= 10;
  ensure(70);
  const boxW = 210;
  const boxX = right - boxW;
  page.drawRectangle({
    x: boxX,
    y: y - 52,
    width: boxW,
    height: 64,
    borderColor: rgb(0.75, 0.72, 0.68),
    borderWidth: 1,
  });
  const money = (label: string, value: number, useBold: boolean, yy: number) => {
    page.drawText(label, { x: boxX + 8, y: yy, size: 10, font: useBold ? bold : font });
    const txt = montantPdf(value);
    page.drawText(txt, {
      x: boxX + boxW - 8 - (useBold ? bold : font).widthOfTextAtSize(txt, 10),
      y: yy,
      size: 10,
      font: useBold ? bold : font,
    });
  };
  money("Total HT", totaux.ht, false, y - 8);
  money(`TVA ${input.devis.tva_pct} %`, totaux.tva, false, y - 24);
  money("Total TTC", totaux.ttc, true, y - 42);
  y -= 80;

  if (input.devis.notes?.trim()) {
    ensure(40);
    page.drawText("Notes", { x: left, y, size: 11, font: bold });
    y -= 14;
    for (const line of wrapToWidth(input.devis.notes.trim(), font, 9, right - left)) {
      ensure(12);
      page.drawText(line, { x: left, y, size: 9, font });
      y -= 12;
    }
    y -= 8;
  }

  ensure(36);
  page.drawText(
    "Devis hors pose, hors terrassement et hors raccordements, sauf mention contraire.",
    { x: left, y, size: 8, font, color: rgb(0.35, 0.32, 0.28) },
  );
  y -= 12;
  page.drawText("Bon pour accord : date, cachet et signature.", {
    x: left,
    y,
    size: 8,
    font,
    color: rgb(0.35, 0.32, 0.28),
  });

  page.drawText(`${COMPANY_NAME_ASCII} - commandes@lametalleriedusud.com`, {
    x: left,
    y: 40,
    size: 8,
    font,
    color: rgb(0.45, 0.4, 0.35),
  });

  const safeNum = input.devis.numero.replace(/[^\w.-]+/g, "-");
  const fileName = `devis-${safeNum}.pdf`;
  return { bytes: await pdf.save(), fileName };
}
