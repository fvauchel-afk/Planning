-- Ordre d’affichage stable des lignes du planning équipe.

alter table public.employees
  add column if not exists ordre_affichage integer not null default 100;

update public.employees
set ordre_affichage = case
  when k = 'jonathan' then 1
  when k = 'mika' then 2
  when k = 'alexis' then 3
  when k = 'romain' then 4
  when k = 'louison' then 5
  when k = 'ethan' then 6
  when k = 'quentin' then 7
  when k = 'raphael' then 9
  else 100
end
from (
  select
    id,
    lower(
      btrim(
        split_part(
          regexp_replace(
            translate(
              nom,
              'ÀÁÂÄÅàáâäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÖòóôöÙÚÛÜùúûüÇçŸÿ',
              'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuCcYy'
            ),
            '\([^)]*\)',
            ' ',
            'g'
          ),
          ' ',
          1
        )
      )
    ) as k
  from public.employees
) keyed
where public.employees.id = keyed.id;
