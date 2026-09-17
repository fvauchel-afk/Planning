"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  coerceSelectValue,
  employeesForPhaseSelect,
} from "@/lib/chantier-status";
import type { Employee, TypePhase } from "@/lib/types";

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
