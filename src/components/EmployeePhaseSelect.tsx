"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  coerceSelectValue,
  employeesForPhaseSelect,
} from "@/lib/chantier-status";
import { employeeAvailableOnRange } from "@/lib/engine/hours";
import type { Employee, PlanningSnapshot, TypePhase } from "@/lib/types";

export function EmployeePhaseSelect({
  employees,
  type,
  value,
  onChange,
  emptyLabel,
  className,
}: {
  employees: Employee[];
  type: TypePhase;
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  className?: string;
}) {
  const options = useMemo(
    () => employeesForPhaseSelect(employees, type, value),
    [employees, type, value],
  );
  const safeValue = coerceSelectValue(value, options);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (value && !safeValue && employees.length > 0) {
      onChangeRef.current("");
    }
  }, [employees.length, safeValue, value]);

  return (
    <select
      autoComplete="off"
      value={safeValue}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {options.map((employee) => (
        <option key={employee.id} value={employee.id}>
          {employee.nom}
        </option>
      ))}
    </select>
  );
}

export function PoseursCheckboxes({
  employees,
  selectedIds,
  onChange,
  snapshot,
  from,
  to,
}: {
  employees: Employee[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  snapshot: PlanningSnapshot;
  from?: string | null;
  to?: string | null;
}) {
  const options = useMemo(
    () => employeesForPhaseSelect(employees, "pose"),
    [employees],
  );

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((item) => item !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <div className="space-y-1">
      {options.map((employee) => {
        const suggested =
          Boolean(from) &&
          employeeAvailableOnRange(snapshot, employee, from, to || from);
        return (
          <label
            key={employee.id}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(employee.id)}
              onChange={() => toggle(employee.id)}
            />
            <span>{employee.nom}</span>
            {from ? (
              <span
                className={
                  suggested
                    ? "text-[11px] text-emerald-700"
                    : "text-[11px] text-stone-400"
                }
              >
                {suggested ? "libre" : "occupé / hors horaires"}
              </span>
            ) : null}
          </label>
        );
      })}
      <p className="text-[11px] text-stone-500">
        Plusieurs poseurs possibles. S’ils ne sont pas libres, le planning
        proposera un créneau plutôt que de bloquer.
      </p>
    </div>
  );
}
