"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "vauchel_form_draft";
const UNSAVED_EVENT = "vauchel-unsaved-work";

const unsavedKeys = new Set<string>();

export type ChantierCascadeDraft = {
  kind: "chantier";
  id: string;
  path: string;
  planDate: string;
  planEnd: string;
  datesDirty: boolean;
  planEmployeeId: string;
  datesEstimatives: boolean;
  avecPose: boolean;
  avecThermolaquage: boolean;
  avecLivraison: boolean;
  delaiLaquage: string;
  sousTraitantId: string;
  dureeLivraison: string;
  employeLivraison: string;
  employeFabrication: string;
  employePose: string;
};

export type AbsenceCascadeDraft = {
  kind: "absence";
  id: string;
  path: string;
  employeId: string;
  dateDebut: string;
  dateFin: string;
};

export type FormDraft = ChantierCascadeDraft | AbsenceCascadeDraft;

function notifyUnsaved() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UNSAVED_EVENT));
}

export function hasUnsavedWork(): boolean {
  return unsavedKeys.size > 0;
}

export function setUnsavedWork(key: string, unsaved: boolean) {
  const before = unsavedKeys.has(key);
  if (unsaved) unsavedKeys.add(key);
  else unsavedKeys.delete(key);
  if (before !== unsaved) notifyUnsaved();
}

export function useHasUnsavedWork() {
  const [value, setValue] = useState(() => hasUnsavedWork());
  useEffect(() => {
    const sync = () => setValue(hasUnsavedWork());
    sync();
    window.addEventListener(UNSAVED_EVENT, sync);
    return () => window.removeEventListener(UNSAVED_EVENT, sync);
  }, []);
  return value;
}

export function writeFormDraft(draft: FormDraft) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // quota / mode privé
  }
}

export function readFormDraft(): FormDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraft;
    if (!parsed || (parsed.kind !== "chantier" && parsed.kind !== "absence")) {
      return null;
    }
    if (!parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearFormDraft(kind?: FormDraft["kind"], id?: string) {
  try {
    if (kind && id) {
      const current = readFormDraft();
      if (!current || current.kind !== kind || current.id !== id) return;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

type ReopenState = { kind: FormDraft["kind"]; id: string } | null;

const FormDraftContext = createContext<{
  reopen: ReopenState;
  clearReopen: () => void;
}>({
  reopen: null,
  clearReopen: () => undefined,
});

export function FormDraftProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [reopen, setReopen] = useState<ReopenState>(null);

  useEffect(() => {
    const draft = readFormDraft();
    if (!draft) return;
    setReopen({ kind: draft.kind, id: draft.id });
    if (draft.path && draft.path !== pathname) {
      router.replace(draft.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once after reload
  }, []);

  const clearReopen = useCallback(() => setReopen(null), []);
  const value = useMemo(() => ({ reopen, clearReopen }), [reopen, clearReopen]);
  return (
    <FormDraftContext.Provider value={value}>{children}</FormDraftContext.Provider>
  );
}

export function useFormDraftReopen() {
  return useContext(FormDraftContext);
}
