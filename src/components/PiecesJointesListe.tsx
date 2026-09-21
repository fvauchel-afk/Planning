"use client";

import { isImagePiece, type PieceJointe } from "@/lib/pieces-jointes";

export function PiecesJointesListe({
  pieces,
}: {
  pieces: PieceJointe[] | undefined;
}) {
  if (!pieces?.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {pieces.map((piece, index) => (
        <li key={`${piece.nom}-${index}`}>
          <a
            href={piece.dataUrl}
            download={piece.nom}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            {isImagePiece(piece) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={piece.dataUrl}
                alt={piece.nom}
                className="h-24 w-24 rounded border border-stone-300 object-cover"
              />
            ) : (
              <span className="inline-flex min-h-24 min-w-24 max-w-[10rem] items-center justify-center rounded border border-stone-300 bg-white px-2 text-center text-xs font-medium text-sky-800 underline">
                {piece.nom}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
