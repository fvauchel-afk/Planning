"use client";

import {
  EMPTY_CLIENT_CREATE,
  TYPE_CLIENT_LABELS,
  TYPES_CLIENT,
  type ClientCreateInput,
  type TypeClient,
} from "@/lib/devis/types";

export { EMPTY_CLIENT_CREATE };

export function ClientFormFields({
  value,
  onChange,
  fieldClass,
}: {
  value: ClientCreateInput;
  onChange: (next: ClientCreateInput) => void;
  fieldClass: string;
}) {
  function set<K extends keyof ClientCreateInput>(key: K, next: ClientCreateInput[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <>
      <input
        className={fieldClass}
        placeholder="Nom"
        value={value.nom}
        onChange={(e) => set("nom", e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="E-mail"
        value={value.email}
        onChange={(e) => set("email", e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="Téléphone"
        value={value.telephone}
        onChange={(e) => set("telephone", e.target.value)}
      />
      <input
        className={`${fieldClass} md:col-span-2`}
        placeholder="Adresse"
        value={value.adresse}
        onChange={(e) => set("adresse", e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="Code postal"
        value={value.code_postal}
        onChange={(e) => set("code_postal", e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="Ville"
        value={value.ville}
        onChange={(e) => set("ville", e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="Pays"
        value={value.pays}
        onChange={(e) => set("pays", e.target.value)}
      />
      <fieldset className="md:col-span-2">
        <legend className="mb-1 text-sm font-medium text-stone-800">Type de client</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {TYPES_CLIENT.map((type) => (
            <label key={type} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="type_client"
                checked={value.type_client === type}
                onChange={() =>
                  onChange({
                    ...value,
                    type_client: type,
                    siren_siret: type === "professionnel" ? value.siren_siret : "",
                  })
                }
              />
              {TYPE_CLIENT_LABELS[type as TypeClient]}
            </label>
          ))}
        </div>
      </fieldset>
      {value.type_client === "professionnel" ? (
        <input
          className={`${fieldClass} md:col-span-2`}
          placeholder="SIRET"
          value={value.siren_siret}
          onChange={(e) => set("siren_siret", e.target.value)}
        />
      ) : null}
      <label className="md:col-span-2 text-sm">
        <span className="mb-1 block font-medium text-stone-800">Commentaires internes</span>
        <p className="mb-1 text-xs text-amber-900">
          Usage interne uniquement — n’apparaît jamais sur les devis ni les PDF envoyés au client.
        </p>
        <textarea
          className={fieldClass}
          rows={3}
          placeholder="Commentaires sur le client"
          value={value.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>
    </>
  );
}
