import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatIsoFr } from "@/lib/dates";
import { CCG_ARTICLES, DROIT_IMAGE_INTRO } from "@/lib/devis/ccg";
import { formatMontantFr, ligneMontantHt, totauxDevis } from "@/lib/devis/lignes";
import {
  adresseClientLignes,
  adresseEntrepriseLignes,
  mentionsLegalesPied,
  type ClientFiche,
  type Devis,
  type DevisReglages,
  type EntrepriseReglages,
} from "@/lib/devis/types";
import { BRAND_BLUE } from "@/lib/brand";
import { applyMailVars, devisMailVars } from "@/lib/devis/vars";

function hexRgb(hex: string) {
  const n = hex.replace("#", "");
  return rgb(
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  );
}

const BLEU = hexRgb(BRAND_BLUE);
const FOND_TOTAUX = rgb(0.91, 0.93, 0.96);
const NOIR = rgb(0.12, 0.1, 0.08);

async function embedLogo(pdf: PDFDocument, entreprise: EntrepriseReglages) {
  if (entreprise.logo_base64.trim()) {
    try {
      const bytes = Buffer.from(entreprise.logo_base64, "base64");
      if (entreprise.logo_mime.includes("png")) {
        return await pdf.embedPng(bytes);
      }
      return await pdf.embedJpg(bytes);
    } catch {
      // logo invalide : repli fichier local
    }
  }
  try {
    const jpg = await readFile(
      path.join(process.cwd(), "public", "logo-metallerie-du-sud.jpg"),
    );
    return await pdf.embedJpg(jpg);
  } catch {
    return null;
  }
}

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
    .replace(/à|â|ä/g, "a")
    .replace(/À|Â/g, "A")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C")
    .replace(/é|è|ê|ë/g, "e")
    .replace(/É|È|Ê/g, "E")
    .replace(/î|ï/g, "i")
    .replace(/ô/g, "o")
    .replace(/ù|û|ü/g, "u")
    .replace(/²/g, "2")
    .replace(/\u00a0/g, " ");
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const value = pdfSafe(text).replace(/\s+/g, " ").trim() || "-";
  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";
  const fits = (c: string) => font.widthOfTextAtSize(c, size) <= maxWidth;
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

function wrapParas(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paras = text.split(/\n+/);
  const out: string[] = [];
  for (const para of paras) {
    out.push(...wrap(para, font, size, maxWidth));
    out.push("");
  }
  return out.length ? out.slice(0, -1) : [];
}

function montant(n: number): string {
  return `${pdfSafe(formatMontantFr(n))} EUR`;
}

export async function buildDevisPdf(input: {
  devis: Devis;
  client: ClientFiche;
  entreprise: EntrepriseReglages;
  reglages: DevisReglages;
}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const left = 42;
  const right = 553;
  const vars = devisMailVars(input);
  const pied = pdfSafe(mentionsLegalesPied(input.entreprise));
  let pageCount = 0;

  let page!: PDFPage;
  let y = 0;

  const footer = (p: PDFPage, index: number) => {
    p.drawText(pied.slice(0, 120), {
      x: left,
      y: 28,
      size: 7,
      font,
      color: rgb(0.4, 0.38, 0.35),
    });
    const n = `page ${index}`;
    p.drawText(n, {
      x: right - font.widthOfTextAtSize(n, 7),
      y: 28,
      size: 7,
      font,
      color: rgb(0.4, 0.38, 0.35),
    });
  };

  const newPage = () => {
    if (page) footer(page, pageCount);
    page = pdf.addPage(pageSize);
    pageCount += 1;
    y = 800;
  };

  const ensure = (need: number) => {
    if (y - need < 48) newPage();
  };

  newPage();

  const logo = await embedLogo(pdf, input.entreprise);
  if (logo) {
    const logoW = 132;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, { x: left, y: 800 - logoH, width: logoW, height: logoH });
    y = 792 - logoH;
  } else {
    y = 780;
  }

  let ey = y;
  for (const line of adresseEntrepriseLignes(input.entreprise)) {
    page.drawText(pdfSafe(line), { x: left, y: ey, size: 8, font });
    ey -= 11;
  }

  let cy = 780;
  const clientLines = adresseClientLignes(input.client);
  if (input.devis.opt_adresse_livraison && input.client.adresse_livraison?.trim()) {
    clientLines.push(`Livraison : ${input.client.adresse_livraison.trim()}`);
  }
  if (input.devis.opt_siren && input.client.siren_siret?.trim()) {
    clientLines.push(`SIREN/SIRET : ${input.client.siren_siret.trim()}`);
  }
  if (input.devis.opt_tva_intra && input.client.tva_intra?.trim()) {
    clientLines.push(`TVA intra : ${input.client.tva_intra.trim()}`);
  }
  for (const line of clientLines) {
    const w = font.widthOfTextAtSize(pdfSafe(line), 9);
    page.drawText(pdfSafe(line), { x: right - w, y: cy, size: 9, font });
    cy -= 12;
  }

  y = Math.min(ey, cy) - 18;
  const titre = input.devis.opt_intitule && input.devis.intitule_document?.trim()
    ? input.devis.intitule_document.trim()
    : `Devis N° ${input.devis.numero}`;
  page.drawText(pdfSafe(titre), { x: left, y, size: 16, font: bold, color: NOIR });
  y -= 18;
  if (input.devis.objet.trim()) {
    for (const line of wrap(input.devis.objet.trim(), bold, 11, right - left)) {
      page.drawText(line, { x: left, y, size: 11, font: bold });
      y -= 14;
    }
  }
  y -= 4;
  page.drawText(pdfSafe(`Date d'emission : ${formatIsoFr(input.devis.date_emission)}`), {
    x: left,
    y,
    size: 9,
    font,
  });
  const validite = `Periode de validite : ${input.devis.validite_jours} jours`;
  page.drawText(pdfSafe(validite), {
    x: right - font.widthOfTextAtSize(pdfSafe(validite), 9),
    y,
    size: 9,
    font,
  });
  y -= 16;

  const cols = {
    des: left + 4,
    qty: 318,
    unite: 358,
    pu: 408,
    tva: 468,
    mt: 508,
  };
  const desW = 268;

  const headerRow = () => {
    ensure(22);
    page.drawRectangle({
      x: left,
      y: y - 5,
      width: right - left,
      height: 18,
      color: BLEU,
    });
    const h = rgb(1, 1, 1);
    page.drawText("Designation", { x: cols.des, y, size: 8, font: bold, color: h });
    page.drawText("Qte", { x: cols.qty, y, size: 8, font: bold, color: h });
    page.drawText("Unite", { x: cols.unite, y, size: 8, font: bold, color: h });
    page.drawText("PU HT", { x: cols.pu, y, size: 8, font: bold, color: h });
    page.drawText("TVA", { x: cols.tva, y, size: 8, font: bold, color: h });
    page.drawText("Montant HT", { x: cols.mt, y, size: 8, font: bold, color: h });
    y -= 20;
  };
  headerRow();

  const lignes = input.devis.lignes.length
    ? input.devis.lignes
    : [{ designation: "(aucune ligne)", quantite: 0, unite: "-", prix_unitaire_ht: 0, tva_pct: 0 }];

  for (const row of lignes) {
    const desLines = wrapParas(row.designation || "-", font, 8, desW);
    const rowH = Math.max(16, desLines.length * 10 + 4);
    if (y - rowH < 48) {
      newPage();
      headerRow();
    }
    desLines.forEach((line, i) => {
      page.drawText(line, { x: cols.des, y: y - i * 10, size: 8, font });
    });
    page.drawText(pdfSafe(String(row.quantite)), { x: cols.qty, y, size: 8, font });
    page.drawText(pdfSafe(row.unite), { x: cols.unite, y, size: 8, font });
    page.drawText(montant(row.prix_unitaire_ht), { x: cols.pu, y, size: 8, font });
    page.drawText(`${row.tva_pct} %`, { x: cols.tva, y, size: 8, font });
    page.drawText(montant(ligneMontantHt(row)), { x: cols.mt, y, size: 8, font });
    y -= rowH;
  }

  const remise = input.devis.opt_remise ? input.devis.remise : null;
  const totaux = totauxDevis(input.devis.lignes, remise);
  y -= 10;
  const boxH = 28 + totaux.parTaux.length * 14 + (totaux.remise > 0 ? 14 : 0) + 18;
  ensure(boxH + 8);
  const boxW = 230;
  const boxX = right - boxW;
  page.drawRectangle({
    x: boxX,
    y: y - boxH + 12,
    width: boxW,
    height: boxH,
    color: FOND_TOTAUX,
  });
  const lineTot = (label: string, value: string, bolded: boolean, yy: number) => {
    page.drawText(pdfSafe(label), { x: boxX + 8, y: yy, size: 9, font: bolded ? bold : font });
    page.drawText(value, {
      x: boxX + boxW - 8 - (bolded ? bold : font).widthOfTextAtSize(value, 9),
      y: yy,
      size: 9,
      font: bolded ? bold : font,
    });
  };
  let ty = y;
  lineTot("Total HT", montant(totaux.htBrut), false, ty);
  ty -= 14;
  if (totaux.remise > 0) {
    const lab =
      remise?.type === "pourcentage"
        ? `Remise ${remise.valeur} %`
        : "Remise";
    lineTot(lab, `- ${montant(totaux.remise)}`, false, ty);
    ty -= 14;
    lineTot("Net HT", montant(totaux.ht), false, ty);
    ty -= 14;
  }
  for (const bucket of totaux.parTaux) {
    lineTot(`TVA ${bucket.taux} % sur ${montant(bucket.ht)}`, montant(bucket.tva), false, ty);
    ty -= 14;
  }
  lineTot("Total TTC", montant(totaux.ttc), true, ty);
  y -= boxH + 12;

  const drawTextBlock = (title: string, body: string) => {
    newPage();
    page.drawText(pdfSafe(title), { x: left, y, size: 13, font: bold });
    y -= 18;
    for (const line of wrapParas(applyMailVars(body, vars), font, 9, right - left)) {
      ensure(12);
      if (line === "") {
        y -= 6;
        continue;
      }
      page.drawText(line, { x: left, y, size: 9, font });
      y -= 11;
    }
  };

  if (input.devis.opt_conditions && input.reglages.conditions_acceptation_actif) {
    drawTextBlock(
      "Conditions d'acceptation",
      input.reglages.conditions_acceptation_texte,
    );
  }
  if (input.devis.opt_champ_libre && input.reglages.champ_libre_texte.trim()) {
    drawTextBlock("Informations", input.reglages.champ_libre_texte);
  }

  newPage();
  page.drawText("Cahier de Clauses Generales", { x: left, y, size: 14, font: bold });
  y -= 20;
  for (const article of CCG_ARTICLES) {
    ensure(36);
    page.drawText(pdfSafe(article.titre), { x: left, y, size: 10, font: bold });
    y -= 13;
    for (const line of wrap(applyMailVars(article.corps, vars), font, 8, right - left)) {
      ensure(11);
      page.drawText(line, { x: left, y, size: 8, font });
      y -= 10;
    }
    y -= 6;
  }

  newPage();
  page.drawText("Autorisation de droit a l'image", { x: left, y, size: 14, font: bold });
  y -= 18;
  for (const line of wrap(applyMailVars(DROIT_IMAGE_INTRO, vars), font, 9, right - left)) {
    ensure(12);
    page.drawText(line, { x: left, y, size: 9, font });
    y -= 11;
  }
  y -= 16;
  page.drawRectangle({ x: left, y: y - 4, width: 10, height: 10, borderColor: NOIR, borderWidth: 1 });
  page.drawText("J'AUTORISE cette utilisation", { x: left + 16, y, size: 10, font });
  y -= 18;
  page.drawRectangle({ x: left, y: y - 4, width: 10, height: 10, borderColor: NOIR, borderWidth: 1 });
  page.drawText("JE N'AUTORISE PAS cette utilisation", { x: left + 16, y, size: 10, font });
  y -= 28;
  page.drawText("Fait a : ________________________    Le : ____ / ____ / ________", {
    x: left,
    y,
    size: 10,
    font,
  });
  y -= 36;
  page.drawText("Signature (droit a l'image, separee du CCG)", { x: left, y, size: 9, font });
  page.drawRectangle({
    x: left,
    y: y - 70,
    width: 220,
    height: 64,
    borderColor: rgb(0.6, 0.58, 0.55),
    borderWidth: 1,
  });

  newPage();
  page.drawText("Validation du devis", { x: left, y, size: 14, font: bold });
  y -= 22;
  const nom = input.client.nom.trim() || "________________";
  for (const line of wrap(
    `Je soussigne(e) ${nom}, reconnais avoir pris connaissance du present Cahier de Clauses Generales et l'accepte sans reserve.`,
    font,
    10,
    right - left,
  )) {
    page.drawText(line, { x: left, y, size: 10, font });
    y -= 13;
  }
  y -= 12;
  page.drawText("Fait a : ________________________    Le : ____ / ____ / ________", {
    x: left,
    y,
    size: 10,
    font,
  });
  y -= 22;
  page.drawText(
    pdfSafe(
      `Lu et approuve, CCG et bon pour accord Devis numero ${input.devis.numero}`,
    ),
    { x: left, y, size: 10, font: bold },
  );
  y -= 16;
  if (input.devis.opt_signature) {
    page.drawRectangle({
      x: left,
      y: y - 90,
      width: 260,
      height: 88,
      borderColor: NOIR,
      borderWidth: 1,
    });
    page.drawText("Signature", { x: left + 8, y: y - 12, size: 8, font, color: rgb(0.45, 0.42, 0.4) });
  }

  footer(page, pageCount);
  const total = pdf.getPageCount();
  for (let i = 0; i < total; i += 1) {
    const p = pdf.getPage(i);
    const label = `page ${i + 1} / ${total}`;
    p.drawText(label, {
      x: right - font.widthOfTextAtSize(label, 7),
      y: 28,
      size: 7,
      font,
      color: rgb(0.4, 0.38, 0.35),
    });
  }

  const fileName = `devis-${input.devis.numero}-${pdfSafe(input.client.nom || "client").replace(/\s+/g, "-")}.pdf`;
  return { bytes: await pdf.save(), fileName };
}
