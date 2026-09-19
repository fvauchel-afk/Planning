export type PlanLeoListe = {
  id: string;
  client_nom: string;
  reference: string;
  indice: string;
  chantier_id: string | null;
  onedrive_svg: string | null;
  onedrive_json: string | null;
  updated_at: string | null;
};

export type PlanLeo = PlanLeoListe & {
  params: Record<string, string | number>;
};
