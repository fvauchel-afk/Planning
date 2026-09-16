"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultHoraires,
  defaultHorairesEmploye,
  dayHoursFromJour,
  formatHoursLabel,
  formatMmddInput,
  horairesOf,
  mmddFromInput,
  normalizeHorairesEmploye,
} from "@/lib/engine/hours";
import { compareEmployeesByOrdre } from "@/lib/display-order";
import { usePlanning } from "@/lib/planning-context";
import { useDebouncedPatch } from "@/lib/form-live";
import { formatSaveError } from "@/lib/supabase/errors";
import {
  JOURS_OUVRES,
  JOUR_OUVRE_LABELS,
  ROLE_LABELS,
  ROLES,
  type Employee,
  type HoraireSaison,
  type HorairesEmploye,
  type HorairesJour,
  type Role,
} from "@/lib/types";

const HEURE_FIELDS: { key: keyof HorairesJour; label: string }[] = [
  { key: "embauche", label: "Embauche" },
  { key: "pause_debut", label: "Début pause" },
  { key: "pause_reprise", label: "Reprise" },
  { key: "debouche", label: "Débauche" },
];

function resumeHoraires(horaires: HorairesEmploye | null | undefined): string {
  const lundi =
    normalizeHorairesEmploye(horaires).ete.jours["1"] ?? {
      embauche: "",
      pause_debut: "",
      pause_reprise: "",
      debouche: "",
    };
  const heures = dayHoursFromJour(lundi);
  if (!lundi.embauche && heures === 0) return "Non renseigné";
  const fin = lundi.debouche || lundi.pause_debut;
  return `Été ${lundi.embauche || "—"}–${fin || "—"} (${formatHoursLabel(heures)} lun.)`;
}

function HorairesTable({
  title,
  saison,
  horaires,
  onChange,
}: {
  title: string;
  saison: "ete" | "hiver";
  horaires: HorairesEmploye;
  onChange: (next: HorairesEmploye) => void;
}) {
  function update(day: number, field: keyof HorairesJour, value: string) {
    const key = String(day);
    const current = horaires[saison].jours[key] ?? {
      embauche: "",
      pause_debut: "",
      pause_reprise: "",
      debouche: "",
    };
    onChange({
      ...horaires,
      [saison]: {
        jours: {
          ...horaires[saison].jours,
          [key]: { ...current, [field]: value },
        },
      },
    });
  }

  function weekTotal(): number {
    const sum = JOURS_OUVRES.reduce((total, day) => {
      const jour = horaires[saison].jours[String(day)] ?? {
        embauche: "",
        pause_debut: "",
        pause_reprise: "",
        debouche: "",
      };
      return total + dayHoursFromJour(jour);
    }, 0);
    return Math.round(sum * 100) / 100;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="font-medium text-stone-900">{title}</legend>
      <p className="text-xs text-stone-600">
        Laissez vide un jour non travaillé. Vendredi matin seulement : embauche
        + début de pause, reprise et débauche vides.
      </p>
      <div className="overflow-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-stone-500">
              <th className="pr-2 pb-1 font-medium">Jour</th>
              {HEURE_FIELDS.map((field) => (
                <th key={field.key} className="pr-2 pb-1 font-medium">
                  {field.label}
                </th>
              ))}
              <th className="pb-1 font-medium text-right">Heures</th>
            </tr>
          </thead>
          <tbody>
            {JOURS_OUVRES.map((day) => {
              const jour = horaires[saison].jours[String(day)] ?? {
                embauche: "",
                pause_debut: "",
                pause_reprise: "",
                debouche: "",
              };
              return (
                <tr key={day}>
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {JOUR_OUVRE_LABELS[day]}
                  </td>
                  {HEURE_FIELDS.map((field) => (
                    <td key={field.key} className="py-1 pr-2">
                      <input
                        type="time"
                        value={jour[field.key]}
                        onChange={(event) =>
                          update(day, field.key, event.target.value)
                        }
                        className="w-[6.5rem] rounded border border-stone-300 px-1 py-1"
                      />
                    </td>
                  ))}
                  <td className="py-1 whitespace-nowrap text-right tabular-nums text-stone-700">
                    {formatHoursLabel(dayHoursFromJour(jour))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm font-medium text-stone-900">
        Total semaine : {formatHoursLabel(weekTotal())}
      </p>
    </fieldset>
  );
}

export function EmployeesPage() {
  const { snapshot, upsertEmployee, patchEmployee, saveHoraires, loading } =
    usePlanning();
  const [saisons, setSaisons] = useState<HoraireSaison[]>(() =>
    horairesOf(snapshot),
  );
  const [savingSaisons, setSavingSaisons] = useState(false);
  const [saisonInfo, setSaisonInfo] = useState<string | null>(null);
  const [saisonError, setSaisonError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Employee | null>(null);
  const [nom, setNom] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [actif, setActif] = useState(true);
  const [horaires, setHoraires] = useState<HorairesEmploye>(
    defaultHorairesEmploye(),
  );
  const [pin, setPin] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const dirty = useRef(new Set<string>());

  const applyEmployeePatch = useCallback(
    async (payload: {
      nom?: string;
      roles?: Role[];
      actif?: boolean;
      horaires?: HorairesEmploye | null;
      is_admin?: boolean;
      pin?: string;
    }) => {
      if (!editing?.id) return;
      try {
        await patchEmployee({ id: editing.id, ...payload });
        Object.keys(payload).forEach((key) => dirty.current.delete(key));
      } catch (err) {
        setError(formatSaveError(err, "l’enregistrement automatique a échoué"));
      }
    },
    [editing?.id, patchEmployee],
  );
  const live = useDebouncedPatch(applyEmployeePatch);

  useEffect(() => {
    setSaisons(horairesOf(snapshot));
  }, [snapshot]);

  function startEdit(employee: Employee) {
    live.cancel();
    dirty.current.clear();
    setEditing(employee);
    setNom(employee.nom);
    setRoles(employee.roles);
    setActif(employee.actif);
    setIsAdmin(Boolean(employee.is_admin));
    setPin("");
    setHoraires(normalizeHorairesEmploye(employee.horaires));
  }

  function resetForm() {
    live.cancel();
    dirty.current.clear();
    setEditing(null);
    setNom("");
    setRoles([]);
    setActif(true);
    setIsAdmin(false);
    setPin("");
    setHoraires(defaultHorairesEmploye());
  }

  useEffect(() => {
    if (!editing) return;
    const remote = snapshot.employees.find((item) => item.id === editing.id);
    if (!remote) return;
    if (!dirty.current.has("nom")) setNom(remote.nom);
    if (!dirty.current.has("roles")) setRoles(remote.roles);
    if (!dirty.current.has("actif")) setActif(remote.actif);
    if (!dirty.current.has("is_admin")) setIsAdmin(Boolean(remote.is_admin));
    if (!dirty.current.has("horaires")) {
      setHoraires(normalizeHorairesEmploye(remote.horaires));
    }
  }, [snapshot, editing]);

  function toggleRole(role: Role) {
    setRoles((current) => {
      const next = current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role];
      dirty.current.add("roles");
      if (editing && next.length > 0) {
        void applyEmployeePatch({ roles: next });
      }
      return next;
    });
  }

  async function onSaveSaisons(event: React.FormEvent) {
    event.preventDefault();
    for (const row of saisons) {
      if (!row.debut_mmdd || !row.fin_mmdd) {
        setSaisonError("Chaque saison doit avoir une date de début et de fin.");
        return;
      }
    }
    setSaisonError(null);
    setSavingSaisons(true);
    try {
      await saveHoraires(saisons);
      setSaisonInfo("Dates été / hiver enregistrées.");
    } catch (err) {
      setSaisonError(formatSaveError(err, "les saisons n’ont pas été enregistrées"));
    } finally {
      setSavingSaisons(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!nom.trim() || roles.length === 0) {
      setError("Nom et au moins un rôle sont obligatoires.");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      setError("Le code PIN doit contenir 4 chiffres.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await live.flush();
      await upsertEmployee({
        id: editing?.id,
        nom: nom.trim(),
        roles,
        actif,
        is_admin: isAdmin,
        pin: pin || undefined,
        horaires,
      });
      resetForm();
    } catch (err) {
      const message = formatSaveError(err, "le salarié n’a pas été enregistré");
      setError(message);
      requestAnimationFrame(() => {
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={onSaveSaisons}
        className="rounded-lg border border-stone-300 bg-white p-4 space-y-3"
      >
        <h2 className="font-serif text-xl text-stone-900">Saisons été / hiver</h2>
        <p className="text-sm text-stone-600">
          Seul réglage global : les dates se répètent chaque année. Les horaires
          se renseignent sur chaque fiche salarié.
        </p>
        {loading && <p className="text-sm text-stone-500">Chargement…</p>}
        {saisonError && <p className="text-sm text-red-700">{saisonError}</p>}
        {saisonInfo && <p className="text-sm text-stone-700">{saisonInfo}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {saisons.map((row) => (
            <div key={row.id} className="grid gap-2 sm:grid-cols-2">
              <p className="sm:col-span-2 font-medium">{row.nom || "Saison"}</p>
              <label className="block text-sm">
                <span className="mb-1 block">Début</span>
                <input
                  type="date"
                  value={formatMmddInput(row.debut_mmdd)}
                  onChange={(event) =>
                    setSaisons((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              debut_mmdd: mmddFromInput(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block">Fin</span>
                <input
                  type="date"
                  value={formatMmddInput(row.fin_mmdd)}
                  onChange={(event) =>
                    setSaisons((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? {
                              ...item,
                              fin_mmdd: mmddFromInput(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                  className="w-full rounded border border-stone-300 px-3 py-2"
                />
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={savingSaisons}
            className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
          >
            {savingSaisons ? "Enregistrement…" : "Enregistrer les saisons"}
          </button>
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-2 text-sm"
            onClick={() => setSaisons(defaultHoraires())}
          >
            Réinitialiser été / hiver
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(22rem,32rem)]">
        <div>
          <h2 className="font-serif text-3xl text-stone-900">Employés</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600">
            Le thermolaquage n&apos;a pas de personne attitrée : il reste
            sous-traité. Les horaires réels (été et hiver) se renseignent en
            modifiant un salarié. Sur une fiche déjà ouverte, les champs
            s’enregistrent tout seuls.
          </p>
          <div className="overflow-hidden rounded-lg border border-stone-300 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-stone-100 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Rôles</th>
                  <th className="px-3 py-2 font-medium">Horaires</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Droits</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {[...snapshot.employees].sort(compareEmployeesByOrdre).map((employee) => (
                  <tr key={employee.id} className="border-t border-stone-200">
                    <td className="px-3 py-2">{employee.nom}</td>
                    <td className="px-3 py-2 capitalize">
                      {employee.roles.map((role) => ROLE_LABELS[role]).join(", ")}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-600">
                      {resumeHoraires(employee.horaires)}
                    </td>
                    <td className="px-3 py-2">
                      {employee.actif ? "Actif" : "Inactif"}
                    </td>
                    <td className="px-3 py-2">
                      {employee.is_admin ? "Admin" : "Salarié"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="text-amber-800"
                        onClick={() => startEdit(employee)}
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="h-fit space-y-4 rounded-lg border border-stone-300 bg-white p-4"
        >
          <h3 className="font-medium">
            {editing ? "Modifier un employé" : "Ajouter un employé"}
          </h3>
          {error && (
            <p
              ref={errorRef}
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
            >
              {error}
            </p>
          )}
          <label className="block text-sm">
            <span className="mb-1 block">Nom</span>
            <input
              value={nom}
              onChange={(event) => {
                const value = event.target.value;
                setNom(value);
                dirty.current.add("nom");
                if (editing && value.trim()) {
                  live.schedule({ nom: value.trim() });
                }
              }}
              onBlur={() => {
                if (editing) void live.flush();
              }}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1">Rôles</legend>
            {ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => toggleRole(role)}
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </fieldset>
          <HorairesTable
            title="Horaires été"
            saison="ete"
            horaires={horaires}
            onChange={(next) => {
              setHoraires(next);
              dirty.current.add("horaires");
              if (editing) live.schedule({ horaires: next });
            }}
          />
          <HorairesTable
            title="Horaires hiver"
            saison="hiver"
            horaires={horaires}
            onChange={(next) => {
              setHoraires(next);
              dirty.current.add("horaires");
              if (editing) live.schedule({ horaires: next });
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={actif}
              onChange={(event) => {
                const value = event.target.checked;
                setActif(value);
                dirty.current.add("actif");
                if (editing) void applyEmployeePatch({ actif: value });
              }}
            />
            Actif
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(event) => {
                const value = event.target.checked;
                setIsAdmin(value);
                dirty.current.add("is_admin");
                if (editing) void applyEmployeePatch({ is_admin: value });
              }}
            />
            Administrateur (accès complet)
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Code PIN (4 chiffres)</span>
            <input
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(event) => {
                const value = event.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(value);
                if (editing && /^\d{4}$/.test(value)) {
                  void applyEmployeePatch({ pin: value });
                }
              }}
              placeholder={editing ? "Laisser vide pour ne pas changer" : "1234 par défaut"}
              className="w-full rounded border border-stone-300 px-3 py-2"
            />
          </label>
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="text-sm font-medium text-red-800">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-amber-700 px-3 py-2 text-sm text-amber-50 disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded border border-stone-300 px-3 py-2 text-sm"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
