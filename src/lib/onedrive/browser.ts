export function composeReceptionPng(input: {
  signatureDataUrl: string;
  nomClient: string;
  nomElement: string;
  nomSignataire: string;
  dateLabel: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 620;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas indisponible."));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1c1917";
    ctx.font = "600 28px sans-serif";
    ctx.fillText("Réception de chantier", 40, 52);
    ctx.font = "18px sans-serif";
    ctx.fillStyle = "#44403c";
    const lines = [
      `Client : ${input.nomClient}`,
      `Élément : ${input.nomElement}`,
      `Signataire : ${input.nomSignataire}`,
      `Date : ${input.dateLabel}`,
    ];
    lines.forEach((line, index) => {
      ctx.fillText(line, 40, 100 + index * 28);
    });
    ctx.strokeStyle = "#d6d3d1";
    ctx.strokeRect(40, 220, 920, 360);

    const img = new Image();
    img.onload = () => {
      const maxW = 880;
      const maxH = 320;
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, 60, 240, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Lecture de la signature impossible."));
    img.src = input.signatureDataUrl;
  });
}

export async function requestEnsureOnedriveFolder(input: {
  chantierId: string;
  nomClient: string;
}): Promise<{ shareUrl?: string; skipped?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/onedrive/ensure-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as {
      shareUrl?: string;
      skipped?: boolean;
      error?: string;
    };
    if (!res.ok) return { error: json.error || "Création du dossier OneDrive impossible." };
    return json;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Création du dossier OneDrive impossible.",
    };
  }
}

export async function requestUploadReceptionOnedrive(input: {
  phaseId: string;
  receptionId?: string;
  nomClient: string;
  nomElement: string;
  nomSignataire: string;
  dateIso: string;
  pngDataUrl: string;
  lienDossier: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/onedrive/upload-reception", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: json.error || "Envoi OneDrive impossible." };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Envoi OneDrive impossible.",
    };
  }
}
