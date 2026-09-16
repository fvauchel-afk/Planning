#!/usr/bin/env node
/**
 * Génère scripts/stress-chk/seed.sql : 32 salariés TEST-CHK + ~4 mois de planning.
 * N’écrit rien en base. L’agent applique wipe.sql puis seed.sql via SQL (MCP).
 *
 * Composition :
 *   10 Fabrication, 10 Pose, 10 Fabrication+Pose, 2 Administratif
 * PIN uniques 8101–8132 (login_with_pin refuse les doublons).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const THERMOLACK = "bd135f86-d1e1-4c44-8e63-0a6a33c3d106";

const HORAIRES = {
  ete: {
    jours: {
      1: { embauche: "07:30", pause_debut: "12:00", pause_reprise: "13:00", debouche: "16:00" },
      2: { embauche: "07:30", pause_debut: "12:00", pause_reprise: "13:00", debouche: "16:00" },
      3: { embauche: "07:30", pause_debut: "12:00", pause_reprise: "13:00", debouche: "16:00" },
      4: { embauche: "07:30", pause_debut: "12:00", pause_reprise: "13:00", debouche: "16:00" },
      5: { embauche: "07:30", pause_debut: "12:00", pause_reprise: "", debouche: "" },
      6: { embauche: "", pause_debut: "", pause_reprise: "", debouche: "" },
    },
  },
  hiver: {
    jours: {
      1: { embauche: "08:00", pause_debut: "12:00", pause_reprise: "13:00", debouche: "17:00" },
      2: { embauche: "08:00", pause_debut: "12:00", pause_reprise: "13:00", debouche: "17:00" },
      3: { embauche: "08:00", pause_debut: "12:00", pause_reprise: "13:00", debouche: "17:00" },
      4: { embauche: "08:00", pause_debut: "12:00", pause_reprise: "13:00", debouche: "17:00" },
      5: { embauche: "08:00", pause_debut: "12:00", pause_reprise: "", debouche: "" },
      6: { embauche: "", pause_debut: "", pause_reprise: "", debouche: "" },
    },
  },
};

function uuid(kind, n) {
  return `c4ec000${kind}-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function isWeekend(iso) {
  const d = weekday(iso);
  return d === 0 || d === 6;
}

function firstWorking(iso) {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

function addWorkingDays(iso, n) {
  let d = firstWorking(iso);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left -= 1;
  }
  return d;
}

function sqlStr(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlDate(iso) {
  return iso ? sqlStr(iso) : "null";
}

function sqlUuid(id) {
  return id ? `${sqlStr(id)}::uuid` : "null";
}

const PRENOMS_F = [
  "Adrien", "Bastien", "Cedric", "Damien", "Emile",
  "Fabien", "Gael", "Hugo", "Ilan", "Jules",
];
const PRENOMS_P = [
  "Kevin", "Loic", "Marc", "Nolan", "Olivier",
  "Pierre", "Quentin", "Remi", "Sacha", "Theo",
];
const PRENOMS_M = [
  "Ugo", "Victor", "William", "Xavier", "Yann",
  "Zacharie", "Antoine", "Bruno", "Clement", "Dylan",
];
const ELEMENTS = [
  "Portail", "Pergola", "Garde-corps", "Rampe", "Escalier",
  "Grille", "Marquise", "Cloture", "Auvent", "Table",
];
const VILLES = [
  ["12 rue des Forges", "76200 Dieppe"],
  ["8 chemin du Port", "76400 Fecamp"],
  ["3 place de l'Eglise", "76550 Offranville"],
  ["22 avenue de la Gare", "76500 Elbeuf"],
  ["5 impasse des Tilleuls", "76190 Yvetot"],
  ["17 route de Rouen", "76700 Harfleur"],
  ["9 rue du Chateau", "76110 Goderville"],
  ["41 boulevard Maritime", "76370 Neuville"],
];
const RALS = ["7016", "9005", "9010", "6005", "3004", "5010"];
const FINITIONS = ["mat", "satin", "brillant", "texture_fin"];

const employees = [];
let empN = 1;
function addEmp(prenom, kind, roles) {
  const id = uuid(1, empN);
  const pin = String(8100 + empN);
  employees.push({
    id,
    nom: `TEST-CHK ${prenom} ${kind} ${String(empN).padStart(2, "0")}`,
    roles,
    pin,
    ordre: 200 + empN,
    n: empN,
  });
  empN += 1;
  return id;
}

const fab = PRENOMS_F.map((p, i) => addEmp(p, "Fab", ["fabrication"]));
const pose = PRENOMS_P.map((p, i) => addEmp(p, "Pose", ["pose"]));
const mix = PRENOMS_M.map((p, i) => addEmp(p, "Mix", ["fabrication", "pose"]));
const admin = ["Helene", "Luc"].map((p) => addEmp(p, "Admin", ["administratif"]));

const chantiers = [];
const elements = [];
const phases = [];
let chN = 1;
let elN = 1;
let phN = 1;

function pushPhase(elementId, type, hours, debut, fin, employeId, extra = {}) {
  const id = uuid(4, phN++);
  phases.push({
    id,
    element_id: elementId,
    type_phase: type,
    duree_estimee_heures: hours,
    date_debut: debut,
    date_fin: fin,
    employe_id: employeId,
    statut: extra.statut ?? "a_faire",
    urgent: extra.urgent ?? false,
    heure_debut: extra.heure_debut ?? null,
    lancement_valide: extra.lancement_valide ?? false,
    dates_estimatives: extra.dates_estimatives ?? false,
  });
  return id;
}

function addChantier(opts) {
  const id = uuid(2, chN);
  const ville = VILLES[(chN - 1) % VILLES.length];
  const priorite = opts.priorite ?? "normal";
  const thermo = opts.thermo !== false;
  const withPose = opts.withPose !== false;
  const withLiv = opts.withLiv !== false;
  const withAdmin = opts.withAdmin !== false;
  const nEl = opts.elements ?? 1;
  const datesEst = Boolean(opts.dates_estimatives);
  chantiers.push({
    id,
    nom_client: opts.nom,
    adresse: `${ville[0]}, ${ville[1]}`,
    priorite,
    date_creation: opts.created ?? addDays(opts.fabStart, -7),
    dates_estimatives: datesEst,
    sous_traitant_id: thermo ? THERMOLACK : null,
    delai: thermo ? 5 : 5,
    tolerance: priorite === "pas_presse" ? 30 : priorite === "normal" ? 14 : null,
    couleur_ral: thermo ? RALS[chN % RALS.length] : null,
    finition: thermo ? FINITIONS[chN % FINITIONS.length] : null,
    adresse_livraison: withLiv ? `${ville[0]}, ${ville[1]}` : null,
    telephone_livraison: withLiv ? "0232000000" : null,
    plan_valide: opts.plan_valide ?? true,
  });

  for (let e = 0; e < nEl; e += 1) {
    const elId = uuid(3, elN++);
    elements.push({
      id: elId,
      chantier_id: id,
      nom_element: `${ELEMENTS[(chN + e) % ELEMENTS.length]}${nEl > 1 ? ` ${e + 1}` : ""}`,
    });
    const fabStart = firstWorking(addDays(opts.fabStart, e * 2));
    const fabHours = opts.fabHours ?? 24;
    const fabFin = addWorkingDays(fabStart, Math.max(1, Math.ceil(fabHours / 8) - 1));
    const today = "2026-09-16";
    let fabStatut = "a_faire";
    if (fabFin < today) fabStatut = "termine";
    else if (fabStart <= today) fabStatut = "en_cours";

    if (withAdmin) {
      const admStart = addWorkingDays(fabStart, -1);
      pushPhase(elId, "administratif", 4, admStart, admStart, admin[chN % 2], {
        statut: admStart < today ? "termine" : "a_faire",
      });
    }
    pushPhase(elId, "fabrication", fabHours, fabStart, fabFin, opts.fabEmp, {
      statut: fabStatut,
      urgent: priorite === "prioritaire",
      heure_debut: opts.fabHeure ?? "08:00",
      lancement_valide: fabStatut !== "a_faire",
      dates_estimatives: datesEst,
    });

    let after = fabFin;
    if (thermo) {
      const logStart = addWorkingDays(fabFin, 1);
      const logFin = addWorkingDays(logStart, 4);
      pushPhase(elId, "logistique", 40, logStart, logFin, null, {
        statut: logFin < today ? "termine" : "a_faire",
        dates_estimatives: datesEst,
      });
      after = logFin;
    } else {
      pushPhase(elId, "logistique", 0, null, null, null);
    }

    if (withLiv) {
      const liv = addWorkingDays(after, 1);
      pushPhase(elId, "livraison", 2, liv, liv, opts.livEmp ?? opts.poseEmp ?? opts.fabEmp, {
        statut: liv < today ? "termine" : "a_faire",
        heure_debut: "08:00",
        dates_estimatives: datesEst,
      });
      after = liv;
    } else {
      pushPhase(elId, "livraison", 0, null, null, null);
    }

    if (withPose) {
      const poseStart = addWorkingDays(after, 1);
      const poseHours = opts.poseHours ?? 16;
      const poseFin = addWorkingDays(poseStart, Math.max(0, Math.ceil(poseHours / 8) - 1));
      let poseStatut = "a_faire";
      if (poseFin < today) poseStatut = "termine";
      else if (poseStart <= today) poseStatut = "en_cours";
      pushPhase(elId, "pose", poseHours, poseStart, poseFin, opts.poseEmp, {
        statut: poseStatut,
        urgent: priorite === "prioritaire",
        heure_debut: opts.poseHeure ?? "08:00",
        dates_estimatives: datesEst,
      });
    } else {
      pushPhase(elId, "pose", 0, null, null, null);
    }
  }
  chN += 1;
  return id;
}

// ~36 chantiers réguliers, août → décembre 2026
for (let i = 0; i < 36; i += 1) {
  const fabStart = firstWorking(addDays("2026-08-17", i * 3));
  const kind = i % 6;
  const priorite =
    i % 9 === 0 ? "prioritaire" : i % 5 === 0 ? "pas_presse" : "normal";
  addChantier({
    nom: `TEST-CHK Chantier ${String(i + 1).padStart(2, "0")}`,
    fabStart,
    priorite,
    thermo: kind !== 5,
    withPose: kind !== 4,
    withLiv: kind !== 4,
    withAdmin: i % 3 === 0,
    elements: i % 7 === 0 ? 2 : 1,
    fabHours: [16, 24, 32, 40][i % 4],
    poseHours: [8, 16, 24][i % 3],
    fabEmp: i % 2 === 0 ? fab[i % 10] : mix[i % 10],
    poseEmp: i % 2 === 0 ? pose[i % 10] : mix[(i + 3) % 10],
    livEmp: mix[(i + 1) % 10],
    dates_estimatives: i % 8 === 0,
    created: addDays(fabStart, -5),
  });
}

// Surcharge volontaire semaine du 12 oct 2026 (chevauchements → Synthèse > 110 %)
for (let i = 0; i < 10; i += 1) {
  addChantier({
    nom: `TEST-CHK Surcharge Fab ${String(i + 1).padStart(2, "0")}A`,
    fabStart: "2026-10-12",
    priorite: "prioritaire",
    thermo: false,
    withPose: false,
    withLiv: false,
    withAdmin: false,
    fabHours: 32,
    fabEmp: fab[i],
    fabHeure: "08:00",
    created: "2026-10-01",
  });
  addChantier({
    nom: `TEST-CHK Surcharge Fab ${String(i + 1).padStart(2, "0")}B`,
    fabStart: "2026-10-12",
    priorite: "normal",
    thermo: false,
    withPose: false,
    withLiv: false,
    withAdmin: false,
    fabHours: 32,
    fabEmp: fab[i],
    fabHeure: "09:30",
    created: "2026-10-01",
  });
}
for (let i = 0; i < 10; i += 1) {
  addChantier({
    nom: `TEST-CHK Surcharge Mix ${String(i + 1).padStart(2, "0")}A`,
    fabStart: "2026-10-12",
    priorite: "prioritaire",
    thermo: true,
    withPose: true,
    withLiv: true,
    withAdmin: false,
    fabHours: 32,
    poseHours: 16,
    fabEmp: mix[i],
    poseEmp: mix[i],
    livEmp: pose[i],
    fabHeure: "08:00",
    poseHeure: "08:00",
    created: "2026-10-01",
  });
  addChantier({
    nom: `TEST-CHK Surcharge Mix ${String(i + 1).padStart(2, "0")}B`,
    fabStart: "2026-10-12",
    priorite: "normal",
    thermo: false,
    withPose: true,
    withLiv: false,
    withAdmin: false,
    fabHours: 24,
    poseHours: 16,
    fabEmp: mix[i],
    poseEmp: mix[i],
    fabHeure: "09:30",
    poseHeure: "09:30",
    created: "2026-10-01",
  });
}
for (let i = 0; i < 10; i += 1) {
  addChantier({
    nom: `TEST-CHK Surcharge Pose ${String(i + 1).padStart(2, "0")}A`,
    fabStart: "2026-10-05",
    priorite: "normal",
    thermo: true,
    withPose: true,
    withLiv: true,
    withAdmin: false,
    fabHours: 16,
    poseHours: 24,
    fabEmp: fab[(i + 2) % 10],
    poseEmp: pose[i],
    livEmp: pose[i],
    poseHeure: "08:00",
    created: "2026-09-20",
  });
  addChantier({
    nom: `TEST-CHK Surcharge Pose ${String(i + 1).padStart(2, "0")}B`,
    fabStart: "2026-10-05",
    priorite: "pas_presse",
    thermo: false,
    withPose: true,
    withLiv: false,
    withAdmin: false,
    fabHours: 8,
    poseHours: 24,
    fabEmp: mix[(i + 1) % 10],
    poseEmp: pose[i],
    poseHeure: "10:00",
    created: "2026-09-20",
  });
}

const absences = [];
let abN = 1;
function addAbsence(employeId, debut, fin, type, motif = null) {
  absences.push({
    id: uuid(5, abN++),
    employe_id: employeId,
    date_debut: debut,
    date_fin: fin,
    type,
    motif_precision: motif,
  });
}

// Congés (chevauchent parfois un chantier)
addAbsence(fab[0], "2026-08-24", "2026-08-28", "conge", "Conges ete");
addAbsence(fab[3], "2026-10-26", "2026-10-30", "conge", "Conges automne");
addAbsence(pose[1], "2026-09-21", "2026-09-25", "conge", null);
addAbsence(pose[6], "2026-12-21", "2026-12-24", "conge", "Conges Noel");
addAbsence(mix[2], "2026-10-12", "2026-10-16", "conge", "Chevauche surcharge Mix");
addAbsence(mix[7], "2026-11-02", "2026-11-06", "conge", null);
addAbsence(admin[0], "2026-09-28", "2026-10-02", "conge", null);
addAbsence(fab[8], "2026-12-07", "2026-12-11", "conge", null);

addAbsence(fab[1], "2026-09-17", "2026-09-18", "maladie", "Arret court");
addAbsence(pose[4], "2026-10-20", "2026-10-23", "maladie", "Grippe");
addAbsence(mix[4], "2026-11-16", "2026-11-20", "maladie", "Arret");

addAbsence(fab[5], "2026-09-24", "2026-09-25", "formation", "Soudure");
addAbsence(pose[8], "2026-11-09", "2026-11-10", "formation", "Habilitation");
addAbsence(mix[0], "2026-12-03", "2026-12-04", "formation", "CACES");

// 25 décembre : ferie_entreprise sur l’équipe TEST seulement.
// Attention : le moteur traite tout ferie_entreprise comme jour férié société.
for (const emp of employees) {
  addAbsence(emp.id, "2026-12-25", "2026-12-25", "ferie_entreprise", "Noel TEST-CHK");
}

const demandes = [];
let dmN = 1;
demandes.push({
  id: uuid(6, dmN++),
  employe_id: pose[2],
  categorie: "conge",
  message: "TEST-CHK demande conge en attente",
  statut: "en_attente",
  date_debut: "2026-11-23",
  date_fin: "2026-11-27",
  type_absence: "conge",
  absence_id: null,
});
demandes.push({
  id: uuid(6, dmN++),
  employe_id: fab[2],
  categorie: "conge",
  message: "TEST-CHK demande conge acceptee",
  statut: "acceptee",
  date_debut: absences[1].date_debut,
  date_fin: absences[1].date_fin,
  type_absence: "conge",
  absence_id: absences[1].id,
});
demandes.push({
  id: uuid(6, dmN++),
  employe_id: mix[5],
  categorie: "suggestion_entreprise",
  message: "TEST-CHK suggestion : plus de transpalettes",
  statut: "en_attente",
  date_debut: null,
  date_fin: null,
  type_absence: null,
  absence_id: null,
});

const overlapFabPhases = phases.filter(
  (p) =>
    p.type_phase === "fabrication" &&
    p.date_debut === "2026-10-12" &&
    p.heure_debut === "09:30",
);
const signalements = overlapFabPhases.slice(0, 6).map((p, i) => ({
  id: uuid(7, i + 1),
  employe_id: p.employe_id,
  phase_id: p.id,
  retard_demi_journees: 2,
  note: "TEST-CHK retard volontaire pour cascade",
  statut: "en_attente",
  sens: "retard",
  origine: "salarie",
}));

function values(rows, line) {
  return rows.map(line).join(",\n");
}

const horairesLit = sqlStr(JSON.stringify(HORAIRES)) + "::jsonb";

const employeeSql = `insert into public.employees (
  id, nom, roles, actif, is_admin, ordre_affichage, pin_hash, jours_travailles
) values
${values(employees, (e) => `(${sqlUuid(e.id)}, ${sqlStr(e.nom)}, '{${e.roles.join(",")}}'::role_employe[], true, false, ${e.ordre}, extensions.crypt(${sqlStr(e.pin)}, extensions.gen_salt('bf'::text)), '{1,2,3,4,5}'::smallint[])`)}
;
update public.employees e
set horaires = coalesce(
  (select horaires from public.employees where nom = 'Jonathan' and horaires is not null limit 1),
  ${horairesLit}
)
where e.nom like 'TEST-CHK%';`;

const chantierSql = `insert into public.chantiers (
  id, nom_client, adresse, priorite, date_creation, dates_estimatives,
  sous_traitant_id, delai_sous_traitance_jours, tolerance_deplacement_jours,
  couleur_ral, finition, adresse_livraison, telephone_livraison, plan_valide, fournitures
) values
${values(chantiers, (c) => `(${sqlUuid(c.id)}, ${sqlStr(c.nom_client)}, ${sqlStr(c.adresse)}, ${sqlStr(c.priorite)}::priorite_chantier, ${sqlDate(c.date_creation)}, ${c.dates_estimatives}, ${c.sous_traitant_id ? sqlUuid(c.sous_traitant_id) : "null"}, ${c.delai}, ${c.tolerance == null ? "null" : c.tolerance}, ${c.couleur_ral ? sqlStr(c.couleur_ral) : "null"}, ${c.finition ? sqlStr(c.finition) : "null"}, ${c.adresse_livraison ? sqlStr(c.adresse_livraison) : "null"}, ${c.telephone_livraison ? sqlStr(c.telephone_livraison) : "null"}, ${c.plan_valide}, '[]'::jsonb)`)}
;`;

const elementSql = `insert into public.elements_chantier (id, chantier_id, nom_element) values
${values(elements, (e) => `(${sqlUuid(e.id)}, ${sqlUuid(e.chantier_id)}, ${sqlStr(e.nom_element)})`)}
;`;

function phaseInsert(rows) {
  return `insert into public.phases_planning (
  id, element_id, type_phase, duree_estimee_heures, date_debut, date_fin,
  employe_id, statut, urgent, heure_debut, lancement_valide, dates_estimatives
) values
${values(rows, (p) => `(${sqlUuid(p.id)}, ${sqlUuid(p.element_id)}, ${sqlStr(p.type_phase)}::type_phase, ${p.duree_estimee_heures}, ${sqlDate(p.date_debut)}, ${sqlDate(p.date_fin)}, ${p.employe_id ? sqlUuid(p.employe_id) : "null"}, ${sqlStr(p.statut)}::statut_phase, ${p.urgent}, ${p.heure_debut ? sqlStr(p.heure_debut) : "null"}, ${p.lancement_valide}, ${p.dates_estimatives})`)}
;`;
}
const mid = Math.ceil(phases.length / 2);
const phaseSql = `${phaseInsert(phases.slice(0, mid))}\n${phaseInsert(phases.slice(mid))}`;

const absenceSql = `insert into public.absences (id, employe_id, date_debut, date_fin, type, motif_precision) values
${values(absences, (a) => `(${sqlUuid(a.id)}, ${sqlUuid(a.employe_id)}, ${sqlDate(a.date_debut)}, ${sqlDate(a.date_fin)}, ${sqlStr(a.type)}::type_absence, ${a.motif_precision ? sqlStr(a.motif_precision) : "null"})`)}
;`;

const demandeSql = `insert into public.demandes (
  employe_id, categorie, message, statut, date_debut, date_fin, type_absence, absence_id
) values
${values(demandes, (d) => `(${sqlUuid(d.employe_id)}, ${sqlStr(d.categorie)}::categorie_demande, ${sqlStr(d.message)}, ${sqlStr(d.statut)}::statut_demande, ${sqlDate(d.date_debut)}, ${sqlDate(d.date_fin)}, ${d.type_absence ? `${sqlStr(d.type_absence)}::type_absence` : "null"}, ${d.absence_id ? sqlUuid(d.absence_id) : "null"})`)}
;`;

const signalSql = `insert into public.signalements (
  id, employe_id, phase_id, retard_demi_journees, note, statut, sens, origine
) values
${values(signalements, (s) => `(${sqlUuid(s.id)}, ${sqlUuid(s.employe_id)}, ${sqlUuid(s.phase_id)}, ${s.retard_demi_journees}, ${sqlStr(s.note)}, ${sqlStr(s.statut)}::statut_signalement, ${sqlStr(s.sens)}::type_ecart, ${sqlStr(s.origine)}::origine_signalement)`)}
;`;

const header = `-- Généré par scripts/stress-chk/generate.mjs — ne pas éditer à la main.
-- Préfixe TEST-CHK uniquement. Appliquer wipe.sql avant de relancer.
-- Salariés : ${employees.length} | chantiers : ${chantiers.length} | éléments : ${elements.length} | phases : ${phases.length} | absences : ${absences.length}
begin;
`;

const sql = [
  header,
  employeeSql,
  chantierSql,
  elementSql,
  phaseSql,
  absenceSql,
  demandeSql,
  signalSql,
  "commit;\n",
].join("\n");

mkdirSync(ROOT, { recursive: true });
writeFileSync(join(ROOT, "seed.sql"), sql);
writeFileSync(
  join(ROOT, "manifest.json"),
  JSON.stringify(
    {
      employees: employees.length,
      chantiers: chantiers.length,
      elements: elements.length,
      phases: phases.length,
      absences: absences.length,
      demandes: demandes.length,
      signalements: signalements.length,
      pins: employees.map((e) => ({ nom: e.nom, pin: e.pin, roles: e.roles })),
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    bytes: sql.length,
    employees: employees.length,
    chantiers: chantiers.length,
    elements: elements.length,
    phases: phases.length,
    absences: absences.length,
    demandes: demandes.length,
    signalements: signalements.length,
  }),
);
