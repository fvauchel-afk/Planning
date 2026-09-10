"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { MobileShell } from "@/components/MobileShell";
import { PHASE_LABELS } from "@/lib/types";
import { usePlanning } from "@/lib/planning-context";
import { useSalarieId } from "@/lib/use-salarie";

export function ReceptionPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { snapshot, createReception } = usePlanning();
  const { employeeId, ready } = useSalarieId();
  const phaseId = params.get("phase") ?? "";
  const canvasRef = useRef<SignatureCanvas>(null);
  const [nom, setNom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

  if (!ready) {
    return (
      <MobileShell>
        <p className="text-sm text-stone-500">Chargement…</p>
      </MobileShell>
    );
  }

  if (!employee) {
    router.replace("/moi");
    return null;
  }

  if (done || existing) {
    return (
      <MobileShell employeeName={employee.nom}>
        <h2 className="font-serif text-2xl text-stone-900">Réception enregistrée</h2>
        <p className="mt-2 text-sm text-stone-600">
          La pose de {chantier?.nom_client ?? "ce chantier"} est clôturée.
        </p>
        <Link
          href="/moi"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-stone-900 px-4 text-sm text-white"
        >
          Retour au planning
        </Link>
      </MobileShell>
    );
  }

  if (
    !phase ||
    phase.employe_id !== employeeId ||
    phase.type_phase !== "pose"
  ) {
    return (
      <MobileShell employeeName={employee.nom}>
        <p className="text-sm text-stone-700">
          Cette phase n’est pas disponible pour une réception.
        </p>
        <Link href="/moi" className="mt-4 inline-block text-sm underline">
          Retour au planning
        </Link>
      </MobileShell>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!phase) return;
    if (!nom.trim()) {
      setError("Indiquez le nom du signataire.");
      return;
    }
    if (!canvas || canvas.isEmpty()) {
      setError("Faites signer le client dans la zone prévue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createReception({
        phase_id: phase.id,
        nom_signataire: nom.trim(),
        image_signature: canvas.toDataURL("image/png"),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell employeeName={employee.nom}>
      <h2 className="font-serif text-2xl text-stone-900">Réception de chantier</h2>
      <p className="mt-1 text-sm text-stone-600">
        {chantier?.nom_client} — {element?.nom_element} · {PHASE_LABELS.pose}
      </p>
      {chantier?.adresse && (
        <p className="mt-1 text-sm text-stone-500">{chantier.adresse}</p>
      )}
      {chantier?.lien_dossier_onedrive ? (
        <a
          href={chantier.lien_dossier_onedrive}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-sky-800 underline"
        >
          Ouvrir le dossier OneDrive
        </a>
      ) : (
        <p className="mt-3 text-xs text-stone-500">Aucun lien OneDrive pour ce dossier.</p>
      )}

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-800">
            Nom du client qui signe
          </span>
          <input
            className="w-full min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-base"
            value={nom}
            onChange={(event) => setNom(event.target.value)}
            autoComplete="name"
          />
        </label>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-medium text-stone-800">Signature</p>
            <button
              type="button"
              className="text-xs underline"
              onClick={() => canvasRef.current?.clear()}
            >
              Effacer
            </button>
          </div>
          <div className="h-44 w-full overflow-hidden rounded-lg border border-stone-400 bg-white touch-none">
            <SignatureCanvas
              ref={canvasRef}
              penColor="#1c1917"
              clearOnResize={false}
              canvasProps={{
                className: "h-full w-full",
                style: { touchAction: "none" },
              }}
            />
          </div>
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-stone-900 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Enregistrement…" : "Valider la réception"}
        </button>
      </form>
    </MobileShell>
  );
}
