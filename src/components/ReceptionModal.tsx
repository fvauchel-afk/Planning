"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { usePlanning } from "@/lib/planning-context";
import { planningApiPost } from "@/lib/planning/api";
import { PdfPreview } from "@/components/PdfPreview";
import { ModalFrame } from "@/components/ModalFrame";
import { PHASE_LABELS } from "@/lib/types";

type Preview = {
  fileName: string;
  pdfBase64: string;
  subject: string;
};

export function ReceptionModal({
  phaseId,
  onClose,
}: {
  phaseId: string;
  onClose: () => void;
}) {
  const { snapshot, refresh } = usePlanning();
  const phase = snapshot.phases.find((item) => item.id === phaseId);
  const element = snapshot.elements.find((item) => item.id === phase?.element_id);
  const chantier = snapshot.chantiers.find(
    (item) => item.id === element?.chantier_id,
  );
  const canvasRef = useRef<SignatureCanvas>(null);
  const [nom, setNom] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const isLivraison = phase?.type_phase === "livraison";

  function signatureDataUrl(): string | null {
    const canvas = canvasRef.current;
    if (!canvas || canvas.isEmpty()) return null;
    return canvas.toDataURL("image/png");
  }

  function fillDemoSignature() {
    const pad = canvasRef.current;
    if (!pad) return;
    const off = document.createElement("canvas");
    off.width = 400;
    off.height = 160;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 70);
    ctx.bezierCurveTo(60, 20, 120, 110, 180, 50);
    ctx.bezierCurveTo(210, 30, 230, 80, 260, 55);
    ctx.stroke();
    ctx.font = "18px cursive";
    ctx.fillStyle = "#1c1917";
    ctx.fillText(nom.trim() || "Signature essai", 20, 120);
    pad.fromDataURL(off.toDataURL("image/png"));
    setPreview(null);
  }

  async function makePreview() {
    const image = signatureDataUrl();
    if (!nom.trim()) {
      setError("Indiquez le nom du signataire.");
      return;
    }
    if (!image) {
      setError("Faites une signature dans la zone (ou Signature d’essai).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await planningApiPost<Preview>("/api/planning/reception", {
        phaseId,
        nomSignataire: nom.trim(),
        imageSignature: image,
        confirm: false,
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aperçu impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const image = signatureDataUrl();
    if (!nom.trim() || !image || !preview) return;
    setBusy(true);
    setError(null);
    try {
      const data = await planningApiPost<{ onedriveWarning?: string }>(
        "/api/planning/reception",
        {
          phaseId,
          nomSignataire: nom.trim(),
          imageSignature: image,
          confirm: true,
        },
      );
      await refresh();
      setDone(
        data.onedriveWarning
          ? `Enregistré. Copie OneDrive : ${data.onedriveWarning}`
          : isLivraison
            ? "Bon de livraison enregistré et copié dans OneDrive."
            : "Réception enregistrée, pose clôturée, document copié dans OneDrive.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!phase) return null;

  return (
    <ModalFrame onClose={onClose} maxWidthClass="max-w-2xl" zClass="z-[60]">
        <h3 className="font-serif text-xl text-stone-900">
          {isLivraison ? "Bon de livraison" : "Réception de chantier"}
        </h3>
        {done ? (
          <>
            <p className="mt-3 text-sm text-emerald-800">{done}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
              onClick={onClose}
            >
              Fermer
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-stone-600">
              {chantier?.nom_client} — {element?.nom_element} ·{" "}
              {PHASE_LABELS[phase.type_phase]}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Signature simulée pour le document (pas une signature électronique
              certifiée). Aperçu PDF, puis confirmation — comme le bon de
              commande.
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Nom du signataire</span>
              <input
                className="w-full rounded border border-stone-300 px-3 py-2"
                value={nom}
                onChange={(event) => {
                  setNom(event.target.value);
                  setPreview(null);
                }}
                autoComplete="name"
              />
            </label>
            <div className="mt-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Zone de signature simulée</p>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      fillDemoSignature();
                      setPreview(null);
                    }}
                  >
                    Signature d’essai
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      canvasRef.current?.clear();
                      setPreview(null);
                    }}
                  >
                    Effacer
                  </button>
                </div>
              </div>
              <div className="h-40 w-full overflow-hidden rounded-lg border border-stone-400 bg-white touch-none">
                <SignatureCanvas
                  ref={canvasRef}
                  penColor="#1c1917"
                  clearOnResize={false}
                  canvasProps={{
                    className: "h-full w-full",
                    style: { touchAction: "none" },
                  }}
                  onEnd={() => setPreview(null)}
                />
              </div>
            </div>
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            {preview ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-stone-800">
                  Aperçu — {preview.subject}
                </p>
                <PdfPreview
                  title="Aperçu du document de réception"
                  fileName={preview.fileName}
                  pdfBase64={preview.pdfBase64}
                />
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {!preview ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void makePreview()}
                  className="rounded-lg bg-sky-800 px-4 py-2 text-sm text-sky-50 disabled:opacity-60"
                >
                  {busy ? "Préparation…" : "Aperçu PDF"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirm()}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {busy
                    ? "Enregistrement…"
                    : isLivraison
                      ? "Confirmer le bon de livraison"
                      : "Confirmer et clôturer la pose"}
                </button>
              )}
              <button
                type="button"
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
                onClick={onClose}
              >
                Annuler
              </button>
            </div>
          </>
        )}
    </ModalFrame>
  );
}
