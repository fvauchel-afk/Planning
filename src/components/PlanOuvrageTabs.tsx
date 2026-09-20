"use client";

import Link from "next/link";
import { OUVRAGE_PLAN_LABELS, type OuvragePlan } from "@/lib/plan-leo/ouvrage";

const TAB =
  "rounded-md px-3 py-1.5 text-sm font-medium";

export function PlanOuvrageTabs({ current }: { current: OuvragePlan }) {
  const items: { id: OuvragePlan; href: string }[] = [
    { id: "portail-leo", href: "/plan" },
    { id: "garde-corps", href: "/plan?ouvrage=garde-corps" },
    { id: "pergola", href: "/plan?ouvrage=pergola" },
  ];
  return (
    <div className="plan-no-print flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={
            current === item.id
              ? `${TAB} bg-amber-700 text-amber-50`
              : `${TAB} text-stone-500 hover:bg-stone-100 hover:text-stone-800`
          }
        >
          {OUVRAGE_PLAN_LABELS[item.id]}
        </Link>
      ))}
      <span className={`${TAB} text-stone-400`}>Portillon — à venir</span>
    </div>
  );
}
