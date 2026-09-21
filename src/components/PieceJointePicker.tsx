"use client";

import { useId } from "react";
import { fileToJpegDataUrl } from "@/components/PhotoPicker";
import {
  MAX_PIECE_DATA_URL_CHARS,
  MAX_PIECES_JOINTES,
  MAX_PIECES_TOTAL_CHARS,
  isImagePiece,
  parsePiecesJointes,
  type PieceJointe,
} from "@/lib/pieces-jointes";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export function PieceJointePicker({
  pieces,
  onChange,
  disabled,
  onError,
}: {
  pieces: PieceJointe[];
  onChange: (pieces: PieceJointe[]) => void;
  disabled?: boolean;
  onError?: (message: string | null) => void;
}) {
  const cameraId = `${useId()}-camera`;
  const galleryId = `${useId()}-gallery`;
  const fileId = `${useId()}-file`;
  const full = pieces.length >= MAX_PIECES_JOINTES;
  const lock = disabled || full;

  async function addFiles(list: FileList | null, kind: "image" | "any") {
    if (!list?.length) return;
    onError?.(null);
    const next = [...pieces];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PIECES_JOINTES) break;
      if (kind === "image" && !file.type.startsWith("image/")) continue;
      try {
        const dataUrl = file.type.startsWith("image/")
          ? await fileToJpegDataUrl(file)
          : await fileToDataUrl(file);
        if (dataUrl.length > MAX_PIECE_DATA_URL_CHARS) {
          onError?.(
            `« ${file.name} » est trop lourd. Choisissez un fichier plus léger (environ 1 Mo max).`,
          );
          continue;
        }
        const nextTotal = next.reduce((sum, item) => sum + item.dataUrl.length, 0) + dataUrl.length;
        if (nextTotal > MAX_PIECES_TOTAL_CHARS) {
          onError?.(
            "Les pièces jointes dépassent la taille maximale. Envoyez-en moins, ou des fichiers plus légers.",
          );
          break;
        }
        const mime = file.type.startsWith("image/")
          ? "image/jpeg"
          : file.type || "application/octet-stream";
        next.push({
          nom: file.name || "fichier",
          mime,
          dataUrl,
        });
      } catch {
        onError?.(`Impossible de lire « ${file.name} ».`);
      }
    }
    onChange(parsePiecesJointes(next));
  }

  const bouton =
    "flex w-full cursor-pointer items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm font-medium text-stone-800";

  return (
    <div className="space-y-2">
      <p className="text-xs text-stone-500">
        Photo ou fichier (PDF, image…). {MAX_PIECES_JOINTES} max.
      </p>
      <div className="flex flex-col gap-2">
        <label className={`${bouton} ${lock ? "opacity-50" : "hover:bg-stone-50"}`}>
          Prendre une photo
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={lock}
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files, "image");
              event.target.value = "";
            }}
          />
        </label>
        <label className={`${bouton} ${lock ? "opacity-50" : "hover:bg-stone-50"}`}>
          Choisir une photo
          <input
            id={galleryId}
            type="file"
            accept="image/*"
            multiple
            disabled={lock}
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files, "image");
              event.target.value = "";
            }}
          />
        </label>
        <label className={`${bouton} ${lock ? "opacity-50" : "hover:bg-stone-50"}`}>
          Joindre un fichier
          <input
            id={fileId}
            type="file"
            multiple
            disabled={lock}
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files, "any");
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {pieces.length > 0 ? (
        <ul className="space-y-1">
          {pieces.map((piece, index) => (
            <li
              key={`${piece.nom}-${index}`}
              className="flex items-center gap-2 rounded border border-stone-200 bg-stone-50 px-2 py-1.5"
            >
              {isImagePiece(piece) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={piece.dataUrl}
                  alt=""
                  className="h-10 w-10 rounded object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded bg-white text-[10px] font-medium text-stone-600">
                  Fichier
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-stone-800">
                {piece.nom}
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Retirer ${piece.nom}`}
                onClick={() => onChange(pieces.filter((_, i) => i !== index))}
                className="rounded px-1.5 text-sm text-stone-500 hover:bg-stone-200"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
