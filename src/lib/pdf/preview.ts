export function pdfBase64ToBytes(base64: string): Uint8Array {
  const raw = base64.trim();
  const comma = raw.indexOf(",");
  const payload =
    raw.startsWith("data:") && comma >= 0 ? raw.slice(comma + 1) : raw;
  if (!payload) {
    throw new Error("PDF vide.");
  }
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(payload, "base64"));
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function pdfBytesToBlob(bytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

export function isIosSafariLike(
  userAgent: string,
  maxTouchPoints = 0,
  platform = "",
): boolean {
  const ua = userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (platform === "MacIntel" && maxTouchPoints > 1) return true;
  return false;
}

function runPdfPreviewSelfCheck() {
  const hello = "Hello PDF";
  const b64 = Buffer.from(hello, "utf8").toString("base64");
  const fromRaw = pdfBase64ToBytes(b64);
  if (Buffer.from(fromRaw).toString("utf8") !== hello) {
    throw new Error("pdf-preview: le décodage base64 doit retrouver les octets");
  }
  const fromDataUrl = pdfBase64ToBytes(`data:application/pdf;base64,${b64}`);
  if (Buffer.from(fromDataUrl).toString("utf8") !== hello) {
    throw new Error("pdf-preview: le préfixe data: doit être ignoré");
  }
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  if (!isIosSafariLike(iphone, 5, "iPhone")) {
    throw new Error("pdf-preview: iPhone Safari doit ouvrir le PDF hors iframe");
  }
  if (!isIosSafariLike("Mozilla/5.0", 5, "MacIntel")) {
    throw new Error("pdf-preview: iPadOS (MacIntel + tactile) doit ouvrir le PDF hors iframe");
  }
  const desktopChrome =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  if (isIosSafariLike(desktopChrome, 0, "MacIntel")) {
    throw new Error("pdf-preview: le desktop ne doit pas être traité comme iOS");
  }
  const blob = pdfBytesToBlob(fromRaw);
  if (blob.type !== "application/pdf" || blob.size !== fromRaw.byteLength) {
    throw new Error("pdf-preview: le Blob doit être un PDF de la bonne taille");
  }
}

if (typeof process !== "undefined" && process.versions?.node) {
  runPdfPreviewSelfCheck();
}
