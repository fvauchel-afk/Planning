"use client";

import { useEffect, useState } from "react";
import { isIosSafariLike, pdfBase64ToBytes, pdfBytesToBlob } from "@/lib/pdf/preview";

export function PdfPreview({
  pdfBase64,
  fileName,
  title,
}: {
  pdfBase64: string;
  fileName: string;
  title: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(
      isIosSafariLike(
        navigator.userAgent,
        navigator.maxTouchPoints,
        navigator.platform,
      ),
    );
    const bytes = pdfBase64ToBytes(pdfBase64);
    const blob = pdfBytesToBlob(bytes);
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [pdfBase64]);

  if (!url) {
    return <p className="text-sm text-stone-500">Préparation de l’aperçu…</p>;
  }

  return (
    <div className="space-y-2">
      {ios ? (
        <div className="rounded-lg border border-stone-300 bg-stone-50 px-4 py-6 text-center">
          <p className="text-sm text-stone-700">
            Sur iPhone, ouvrez le PDF pour le vérifier (Safari n’affiche pas
            l’aperçu dans la page).
          </p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg bg-sky-800 px-4 py-2 text-sm text-sky-50"
          >
            Ouvrir le PDF
          </a>
        </div>
      ) : (
        <iframe
          title={title}
          className="h-[28rem] w-full rounded border border-stone-300"
          src={url}
        />
      )}
      <p className="text-xs text-stone-500">
        Fichier : {fileName}
        {" · "}
        <a href={url} download={fileName} className="underline">
          Télécharger
        </a>
      </p>
    </div>
  );
}
