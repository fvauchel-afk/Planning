insert into public.employees (id, nom, roles, actif) values
  ('11111111-1111-4111-8111-111111111111', 'Jonathan', array['administratif']::role_employe[], true),
  ('22222222-2222-4222-8222-222222222222', 'Michael', array['administratif']::role_employe[], true),
  ('33333333-3333-4333-8333-333333333333', 'Alexis', array['fabrication', 'pose']::role_employe[], true),
  ('44444444-4444-4444-8444-444444444444', 'Romain', array['fabrication', 'pose']::role_employe[], true),
  ('55555555-5555-4555-8555-555555555555', 'Raphaël', array['fabrication', 'pose']::role_employe[], true),
  ('66666666-6666-4666-8666-666666666666', 'Ethan', array['fabrication', 'pose']::role_employe[], true),
  ('77777777-7777-4777-8777-777777777777', 'Louison', array['fabrication', 'pose']::role_employe[], true),
  ('88888888-8888-4888-8888-888888888888', 'Quentin (apprenti)', array['fabrication', 'pose']::role_employe[], true)
on conflict (id) do nothing;

insert into public.chantiers (id, nom_client, adresse, lien_dossier_onedrive, priorite, date_creation) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Dupont', '12 rue des Forges, 76200 Dieppe', 'https://onedrive.example/dupont', 'prioritaire', '2026-09-01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Martin', '8 chemin du Port, 76400 Fécamp', null, 'normal', '2026-09-03'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Lefèvre', '3 place de l''Église, 76550 Offranville', 'https://onedrive.example/lefevre', 'pas_presse', '2026-09-05')
on conflict (id) do nothing;

insert into public.elements_chantier (id, chantier_id, nom_element) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Pergola'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'Portail'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'Rampe'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'Table')
on conflict (id) do nothing;

insert into public.phases_planning (
  id, element_id, type_phase, duree_estimee_heures, date_debut, date_fin, employe_id, statut, urgent
) values
  ('ccccccc1-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'administratif', 8, '2026-09-07', '2026-09-07', '11111111-1111-4111-8111-111111111111', 'en_cours', true),
  ('ccccccc1-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'fabrication', 24, '2026-09-08', '2026-09-10', '33333333-3333-4333-8333-333333333333', 'a_faire', true),
  ('ccccccc1-cccc-4ccc-8ccc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'logistique', 16, '2026-09-11', '2026-09-14', null, 'a_faire', false),
  ('ccccccc1-cccc-4ccc-8ccc-ccccccccccc4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'pose', 16, '2026-09-15', '2026-09-16', '33333333-3333-4333-8333-333333333333', 'a_faire', false),
  ('ccccccc2-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'administratif', 4, '2026-09-08', '2026-09-08', '22222222-2222-4222-8222-222222222222', 'a_faire', false),
  ('ccccccc2-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'fabrication', 16, '2026-09-09', '2026-09-10', '44444444-4444-4444-8444-444444444444', 'a_faire', false),
  ('ccccccc2-cccc-4ccc-8ccc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'logistique', 8, '2026-09-15', '2026-09-15', null, 'a_faire', false),
  ('ccccccc2-cccc-4ccc-8ccc-ccccccccccc4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'pose', 8, '2026-09-17', '2026-09-17', '44444444-4444-4444-8444-444444444444', 'a_faire', false),
  ('ccccccc3-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'administratif', 4, '2026-09-09', '2026-09-09', '11111111-1111-4111-8111-111111111111', 'a_faire', false),
  ('ccccccc3-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'fabrication', 16, '2026-09-11', '2026-09-14', '55555555-5555-4555-8555-555555555555', 'a_faire', false),
  ('ccccccc3-cccc-4ccc-8ccc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'logistique', 8, '2026-09-16', '2026-09-16', null, 'a_faire', false),
  ('ccccccc3-cccc-4ccc-8ccc-ccccccccccc4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3', 'pose', 8, '2026-09-18', '2026-09-18', '66666666-6666-4666-8666-666666666666', 'a_faire', false),
  ('ccccccc4-cccc-4ccc-8ccc-ccccccccccc1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'administratif', 2, '2026-09-10', '2026-09-10', '22222222-2222-4222-8222-222222222222', 'a_faire', false),
  ('ccccccc4-cccc-4ccc-8ccc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'fabrication', 12, '2026-09-15', '2026-09-16', '77777777-7777-4777-8777-777777777777', 'a_faire', false),
  ('ccccccc4-cccc-4ccc-8ccc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'logistique', 8, '2026-09-17', '2026-09-17', null, 'a_faire', false),
  ('ccccccc4-cccc-4ccc-8ccc-ccccccccccc4', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4', 'pose', 4, '2026-09-21', '2026-09-21', '88888888-8888-4888-8888-888888888888', 'a_faire', false)
on conflict (id) do nothing;

insert into public.absences (id, employe_id, date_debut, date_fin, type) values
  ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', '66666666-6666-4666-8666-666666666666', '2026-09-10', '2026-09-11', 'conge')
on conflict (id) do nothing;
