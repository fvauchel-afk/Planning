"use client";

import { useMemo, useState } from "react";
import { PlanningPreview } from "@/components/PlanningPreview";
import { PropositionImpact } from "@/components/PropositionImpact";
import { allSolutionsOf } from "@/lib/engine/plan-solutions";
import type { PlanningSnapshot, PlanningSolution, SignalementProposition } from "@/lib/types";

export function PropositionSolutions({
  snapshot,
  proposition,
  onChange,
}: {
  snapshot: PlanningSnapshot;
  proposition: SignalementProposition;
  onChange?: (solution: PlanningSolution) => void;
}) {
  const solutions = useMemo(
    () => allSolutionsOf(proposition),
    [proposition],
  );
  const [selectedId, setSelectedId] = useState(solutions[0]?.id ?? "");
  const selected =
    solutions.find((item) => item.id === selectedId) ?? solutions[0] ?? null;

  function choose(id: string) {
    setSelectedId(id);
    const next = solutions.find((item) => item.id === id);
    if (next) onChange?.(next);
  }

  if (!selected) {
    return <PropositionImpact proposition={proposition} />;
  }

  return (
    <div className="mt-3 space-y-2">
      {solutions.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-800">
            Solutions proposées ({solutions.length})
          </span>
          <select
            className="w-full rounded border border-stone-300 bg-white px-3 py-2 text-sm"
            value={selected.id}
            onChange={(event) => choose(event.target.value)}
          >
            {solutions.map((item, index) => (
              <option key={item.id || String(index)} value={item.id}>
                {index + 1}. {item.title || item.message || `Solution ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {solutions.map((item, index) => {
          const active = item.id === selected.id;
          return (
            <button
              key={item.id || String(index)}
              type="button"
              onClick={() => choose(item.id)}
              className={`rounded-lg border p-3 text-left text-sm ${
                active
                  ? "border-violet-700 bg-violet-50"
                  : "border-stone-200 bg-white"
              }`}
            >
              <p className="font-medium text-stone-900">
                {index + 1}. {item.title || `Solution ${index + 1}`}
              </p>
              <PropositionImpact
                proposition={{
                  message: item.message,
                  patches: item.patches,
                  repercussions: item.repercussions,
                  createChantier: item.createChantier,
                }}
              />
            </button>
          );
        })}
      </div>
      <p className="text-xs font-medium text-stone-700">
        Aperçu du planning si vous validez cette solution
      </p>
      <PlanningPreview snapshot={snapshot} solution={selected} />
    </div>
  );
}
