"use client";

import { type FormEvent, type ReactNode } from "react";

export function ModalFrame({
  onClose,
  children,
  maxWidthClass = "max-w-lg",
  zClass = "z-50",
  as = "div",
  onSubmit,
  panelClassName,
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
  zClass?: string;
  as?: "div" | "form";
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  panelClassName?: string;
}) {
  const panelClass = [
    "relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl",
    maxWidthClass,
    panelClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <button
        type="button"
        aria-label="Fermer"
        title="Fermer"
        onClick={onClose}
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full text-2xl leading-none text-stone-500 hover:bg-stone-100 hover:text-stone-900"
      >
        ×
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 pr-12">{children}</div>
    </>
  );

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-stone-900/50 p-4`}
    >
      {as === "form" ? (
        <form onSubmit={onSubmit} className={panelClass}>
          {inner}
        </form>
      ) : (
        <div className={panelClass} role="dialog" aria-modal="true">
          {inner}
        </div>
      )}
    </div>
  );
}
