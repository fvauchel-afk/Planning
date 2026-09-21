"use client";

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type FormNoticeTone = "error" | "info" | "warn";

const TONE_CLASS: Record<FormNoticeTone, string> = {
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-stone-200 bg-stone-50 text-stone-700",
  warn: "border-amber-300 bg-amber-50 text-amber-950",
};

export function formNoticeToneClass(tone: FormNoticeTone): string {
  return TONE_CLASS[tone];
}

type FormNoticeProps = {
  children?: ReactNode;
  tone?: FormNoticeTone;
  className?: string;
};

export const FormNotice = forwardRef<HTMLParagraphElement, FormNoticeProps>(
  function FormNotice({ children, tone = "error", className = "" }, ref) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (children == null || children === false || children === "") return null;
    const box = `rounded-lg border px-3 py-2 text-sm shadow-sm ${formNoticeToneClass(tone)} ${className}`.trim();
    return (
      <>
        <p ref={ref} role={tone === "error" ? "alert" : "status"} className={box}>
          {children}
        </p>
        {mounted
          ? createPortal(
              <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
              >
                <p
                  className={`pointer-events-auto w-full max-w-[1600px] ${box} shadow-lg`}
                >
                  {children}
                </p>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  },
);

function runFormNoticeSelfCheck() {
  if (!formNoticeToneClass("error").includes("bg-red-50")) {
    throw new Error("form-notice: le bandeau d’erreur doit rester rouge");
  }
  if (!formNoticeToneClass("info").includes("bg-stone-50")) {
    throw new Error("form-notice: le bandeau d’info doit rester gris");
  }
}
runFormNoticeSelfCheck();
