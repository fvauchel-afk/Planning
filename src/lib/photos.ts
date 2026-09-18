export const MAX_PHOTOS = 5;
export const MAX_PHOTO_DATA_URL_CHARS = 2_500_000;

export function parsePhotoDataUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const rows: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const value = item.trim();
    if (!/^data:image\/(jpeg|jpg|png);base64,/i.test(value)) continue;
    if (value.length > MAX_PHOTO_DATA_URL_CHARS) continue;
    rows.push(value);
    if (rows.length >= MAX_PHOTOS) break;
  }
  return rows;
}

export function photoDataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
  extension: "jpg" | "png";
} | null {
  const match = dataUrl
    .trim()
    .match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/i);
  if (!match) return null;
  const kind = match[1].toLowerCase() === "png" ? "png" : "jpeg";
  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  if (!bytes.length) return null;
  return {
    bytes,
    contentType: kind === "png" ? "image/png" : "image/jpeg",
    extension: kind === "png" ? "png" : "jpg",
  };
}

function runPhotosSelfCheck() {
  const parsed = parsePhotoDataUrls([
    "data:image/jpeg;base64,aaaa",
    "https://example.com/x.jpg",
    "data:image/png;base64,bbbb",
  ]);
  if (parsed.length !== 2) {
    throw new Error("photos: n’accepter que les images en data URL");
  }
  if (photoDataUrlToBytes("bonjour")) {
    throw new Error("photos: ignorer un texte qui n’est pas une image");
  }
}

runPhotosSelfCheck();
