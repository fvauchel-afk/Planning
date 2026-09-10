-- Horaires réels par salarié (été / hiver) ; les saisons ne gardent que les dates

alter table public.employees
  add column if not exists horaires jsonb;

update public.employees
set horaires = '{
  "ete": {
    "jours": {
      "1": {"embauche":"07:30","pause_debut":"12:00","pause_reprise":"13:00","debouche":"16:00"},
      "2": {"embauche":"07:30","pause_debut":"12:00","pause_reprise":"13:00","debouche":"16:00"},
      "3": {"embauche":"07:30","pause_debut":"12:00","pause_reprise":"13:00","debouche":"16:00"},
      "4": {"embauche":"07:30","pause_debut":"12:00","pause_reprise":"13:00","debouche":"16:00"},
      "5": {"embauche":"07:30","pause_debut":"12:00","pause_reprise":"","debouche":""},
      "6": {"embauche":"","pause_debut":"","pause_reprise":"","debouche":""}
    }
  },
  "hiver": {
    "jours": {
      "1": {"embauche":"08:00","pause_debut":"12:00","pause_reprise":"13:00","debouche":"17:00"},
      "2": {"embauche":"08:00","pause_debut":"12:00","pause_reprise":"13:00","debouche":"17:00"},
      "3": {"embauche":"08:00","pause_debut":"12:00","pause_reprise":"13:00","debouche":"17:00"},
      "4": {"embauche":"08:00","pause_debut":"12:00","pause_reprise":"13:00","debouche":"17:00"},
      "5": {"embauche":"08:00","pause_debut":"12:00","pause_reprise":"","debouche":""},
      "6": {"embauche":"","pause_debut":"","pause_reprise":"","debouche":""}
    }
  }
}'::jsonb
where horaires is null;
