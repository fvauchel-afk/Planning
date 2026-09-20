"use client";

import { useSearchParams } from "next/navigation";
import { PlanGardeCorps } from "@/components/PlanGardeCorps";
import { PlanPergola } from "@/components/PlanPergola";
import { PlanPortailLeo } from "@/components/PlanPortailLeo";
import { parseOuvragePlan } from "@/lib/plan-leo/ouvrage";

export function PlanHub() {
  const searchParams = useSearchParams();
  const ouvrage = parseOuvragePlan(searchParams.get("ouvrage"));
  if (ouvrage === "garde-corps") return <PlanGardeCorps />;
  if (ouvrage === "pergola") return <PlanPergola />;
  return <PlanPortailLeo />;
}
