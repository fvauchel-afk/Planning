"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MobileShell } from "@/components/MobileShell";
import { ReceptionModal } from "@/components/ReceptionModal";
import { idsEqual } from "@/lib/auth/ids";
import { useSession } from "@/lib/auth/session-context";
import { usePlanning } from "@/lib/planning-context";
import { useSalarieId } from "@/lib/use-salarie";

export function ReceptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { snapshot } = usePlanning();
  const { session } = useSession();
  const { employeeId, ready } = useSalarieId();
  const phaseId = params.get("phase") ?? "";

  const employee = snapshot.employees.find((item) => item.id === employeeId);
  const phase = snapshot.phases.find((item) => item.id === phaseId);
  const element = snapshot.elements.find((item) => item.id === phase?.element_id);
  const chantier = snapshot.chantiers.find(
    (item) => item.id === element?.chantier_id,
  );
  const existing = useMemo(
    () => snapshot.receptions.find((row) => row.phase_id === phaseId),
    [phaseId, snapshot.receptions],
  );
  const canSign =
    Boolean(phase) &&
    (phase?.type_phase === "pose" || phase?.type_phase === "livraison") &&
    (session?.isAdmin || idsEqual(phase?.employe_id, employeeId));
  const home = session?.isAdmin ? "/" : "/moi";

  if (!ready) {
    return (
      <MobileShell>
        <p className="text-sm text-stone-500">Chargement…</p>
      </MobileShell>
    );
  }

  if (!employee && !session?.isAdmin) {
    router.replace("/moi");
    return null;
  }

  if (existing) {
    return (
      <MobileShell employeeName={employee?.nom ?? session?.nom}>
        <h2 className="font-serif text-2xl text-stone-900">
          {phase?.type_phase === "livraison"
            ? "Bon de livraison enregistré"
            : "Réception enregistrée"}
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          {phase?.type_phase === "livraison"
            ? `La livraison de ${chantier?.nom_client ?? "ce chantier"} est signée.`
            : `La pose de ${chantier?.nom_client ?? "ce chantier"} est clôturée.`}
        </p>
        <Link
          href={home}
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-stone-900 px-4 text-sm text-white"
        >
          Retour au planning
        </Link>
      </MobileShell>
    );
  }

  if (!canSign || !phase) {
    return (
      <MobileShell employeeName={employee?.nom ?? session?.nom}>
        <p className="text-sm text-stone-700">
          Cette phase n’est pas disponible pour une signature.
        </p>
        <Link href={home} className="mt-4 inline-block text-sm underline">
          Retour au planning
        </Link>
      </MobileShell>
    );
  }

  return (
    <MobileShell employeeName={employee?.nom ?? session?.nom}>
      <ReceptionModal phaseId={phase.id} onClose={() => router.push(home)} />
    </MobileShell>
  );
}
