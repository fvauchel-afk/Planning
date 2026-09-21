export const MAX_PIECES_JOINTES = 5;
export const MAX_PIECE_DATA_URL_CHARS = 1_400_000;
/** Sous la limite de corps Vercel (~4,5 Mo) pour l’envoi de la demande. */
export const MAX_PIECES_TOTAL_CHARS = 3_200_000;

export type PieceJointe = {
  nom: string;
  mime: string;
  dataUrl: string;
};

function safeNom(raw: unknown, fallback: string): string {
  const value = String(raw ?? "")
    .replace(/^.*[/\\]/, "")
    .replace(/[^\w.\-àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ ]+/g, "")
    .trim();
  return (value || fallback).slice(0, 80);
}

export function isImagePiece(piece: PieceJointe): boolean {
  return piece.mime.startsWith("image/") || /^data:image\//i.test(piece.dataUrl);
}

export function parsePiecesJointes(raw: unknown): PieceJointe[] {
  if (!Array.isArray(raw)) return [];
  const rows: PieceJointe[] = [];
  let index = 0;
  let totalChars = 0;
  for (const item of raw) {
    if (rows.length >= MAX_PIECES_JOINTES) break;
    if (typeof item === "string") {
      const value = item.trim();
      if (!/^data:image\/(jpeg|jpg|png);base64,/i.test(value)) continue;
      if (value.length > MAX_PIECE_DATA_URL_CHARS) continue;
      if (totalChars + value.length > MAX_PIECES_TOTAL_CHARS) continue;
      const png = /^data:image\/png;/i.test(value);
      totalChars += value.length;
      rows.push({
        nom: `photo-${index + 1}.${png ? "png" : "jpg"}`,
        mime: png ? "image/png" : "image/jpeg",
        dataUrl: value,
      });
      index += 1;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PieceJointe>;
    const dataUrl = typeof row.dataUrl === "string" ? row.dataUrl.trim() : "";
    if (!/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) continue;
    if (dataUrl.length > MAX_PIECE_DATA_URL_CHARS) continue;
    if (totalChars + dataUrl.length > MAX_PIECES_TOTAL_CHARS) continue;
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/i);
    const mime =
      typeof row.mime === "string" && row.mime.includes("/")
        ? row.mime.slice(0, 80)
        : mimeMatch?.[1] || "application/octet-stream";
    totalChars += dataUrl.length;
    rows.push({
      nom: safeNom(row.nom, `fichier-${index + 1}`),
      mime,
      dataUrl,
    });
    index += 1;
  }
  return rows;
}

export function photosFromPieces(pieces: PieceJointe[]): string[] {
  return pieces.filter(isImagePiece).map((item) => item.dataUrl);
}

function runPiecesJointesSelfCheck() {
  const fromLegacy = parsePiecesJointes([
    "data:image/jpeg;base64,aaaa",
    "https://example.com/x.pdf",
  ]);
  if (fromLegacy.length !== 1 || fromLegacy[0]?.mime !== "image/jpeg") {
    throw new Error("pieces-jointes: conserver les anciennes photos");
  }
  const pdf = parsePiecesJointes([
    {
      nom: "devis.pdf",
      mime: "application/pdf",
      dataUrl: "data:application/pdf;base64,JVBERi0=",
    },
  ]);
  if (pdf.length !== 1 || pdf[0]?.nom !== "devis.pdf") {
    throw new Error("pieces-jointes: accepter un PDF");
  }
  if (photosFromPieces(pdf).length !== 0) {
    throw new Error("pieces-jointes: un PDF n’est pas une photo");
  }
}
runPiecesJointesSelfCheck();
