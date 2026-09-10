"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "vauchel-salarie-id";

export function useSalarieId() {
  const [employeeId, setEmployeeIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEmployeeIdState(window.localStorage.getItem(KEY));
    setReady(true);
  }, []);

  const setEmployeeId = useCallback((id: string | null) => {
    if (id) {
      window.localStorage.setItem(KEY, id);
    } else {
      window.localStorage.removeItem(KEY);
    }
    setEmployeeIdState(id);
  }, []);

  return { employeeId, setEmployeeId, ready };
}
