"use client";

import { useId } from "react";
import { MAX_PHOTOS, parsePhotoDataUrls } from "@/lib/photos";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.72;

export async function fileToJpegDataUrl(file: File): Promise<string> {
  const bitmap = await loadImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("Impossible de préparer la photo.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

async function loadImageBitmap(file: File): Promise<CanvasImageSource & { width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Lecture de la photo impossible."));
      img.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PhotoPicker({
  photos,
  onChange,
  disabled,
  help,
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  disabled?: boolean;
  help?: string;
}) {
  const cameraId = `${useId()}-camera`;
  const galleryId = `${useId()}-gallery`;

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = [...photos];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PHOTOS) break;
      if (!file.type.startsWith("image/")) continue;
      try {
        const url = await fileToJpegDataUrl(file);
        next.push(url);
      } catch {
        // fichier illisible
      }
    }
    onChange(parsePhotoDataUrls(next));
  }

  return (
    <div className="space-y-2">
      {help ? <p className="text-xs text-stone-500">{help}</p> : null}
      <div className="flex flex-wrap gap-2">
        <label
          className={`cursor-pointer rounded border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 ${
            disabled || photos.length >= MAX_PHOTOS ? "opacity-50" : "hover:bg-stone-50"
          }`}
        >
          Prendre une photo
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled || photos.length >= MAX_PHOTOS}
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <label
          className={`cursor-pointer rounded border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 ${
            disabled || photos.length >= MAX_PHOTOS ? "opacity-50" : "hover:bg-stone-50"
          }`}
        >
          Choisir une photo
          <input
            id={galleryId}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || photos.length >= MAX_PHOTOS}
            className="sr-only"
            onChange={(event) => {
              void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((src, index) => (
            <li key={`${index}-${src.slice(-12)}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Photo ${index + 1}`}
                className="h-16 w-16 rounded border border-stone-300 object-cover"
              />
              <button
                type="button"
                disabled={disabled}
                aria-label="Retirer la photo"
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-stone-900 px-1.5 text-[10px] leading-4 text-white"
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
