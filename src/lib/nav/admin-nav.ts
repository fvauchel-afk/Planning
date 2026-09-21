export type AdminNavLink = {
  href: string;
  label: string;
  /** false = pas de prefetch Next (OneDrive). */
  prefetch?: boolean;
};

export type AdminNavItem = AdminNavLink & {
  children?: AdminNavLink[];
  reunionOnly?: boolean;
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/synthese", label: "Synthèse" },
  { href: "/devis", label: "Devis" },
  {
    href: "/",
    label: "Planning",
    children: [{ href: "/chantiers", label: "Chantiers" }],
  },
  { href: "/reunion", label: "Réunion", reunionOnly: true },
  { href: "/signalements", label: "Signalements" },
  {
    href: "/parametres",
    label: "Paramètres",
    children: [
      { href: "/sous-traitants", label: "Sous-traitants" },
      { href: "/employes", label: "Employés" },
      { href: "/admin/onedrive", label: "OneDrive", prefetch: false },
      { href: "/sauvegarde", label: "Sauvegarde" },
    ],
  },
  { href: "/plan", label: "Plan" },
  { href: "/commandes", label: "Commande" },
  { href: "/absences", label: "Absences" },
  { href: "/demandes", label: "Demandes" },
  { href: "/moi", label: "Mon planning" },
];

export function linkActive(href: string, currentPath: string): boolean {
  if (href === "/") return currentPath === "/";
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function itemActive(item: AdminNavItem, currentPath: string): boolean {
  if (linkActive(item.href, currentPath)) return true;
  return (item.children ?? []).some((child) => linkActive(child.href, currentPath));
}

export function adminNavForSession(canManageReunion: boolean): AdminNavItem[] {
  return ADMIN_NAV.filter((item) => !item.reunionOnly || canManageReunion);
}

export function sectionWithChildren(
  items: AdminNavItem[],
  currentPath: string,
): AdminNavItem | null {
  return (
    items.find(
      (item) => item.children && item.children.length > 0 && itemActive(item, currentPath),
    ) ?? null
  );
}

function runAdminNavSelfCheck() {
  const labels = ADMIN_NAV.map((item) => item.label);
  const expected = [
    "Synthèse",
    "Devis",
    "Planning",
    "Réunion",
    "Signalements",
    "Paramètres",
    "Plan",
    "Commande",
    "Absences",
    "Demandes",
    "Mon planning",
  ];
  if (labels.join("|") !== expected.join("|")) {
    throw new Error(`admin-nav: ordre inattendu (${labels.join(", ")})`);
  }
  const planning = ADMIN_NAV.find((item) => item.href === "/");
  if (planning?.children?.[0]?.href !== "/chantiers") {
    throw new Error("admin-nav: Chantiers doit être sous Planning");
  }
  const params = ADMIN_NAV.find((item) => item.href === "/parametres");
  const childHrefs = (params?.children ?? []).map((item) => item.href);
  if (
    childHrefs.join("|") !==
    "/sous-traitants|/employes|/admin/onedrive|/sauvegarde"
  ) {
    throw new Error("admin-nav: sous-onglets Paramètres");
  }
  if (itemActive(planning!, "/chantiers") !== true) {
    throw new Error("admin-nav: /chantiers doit activer Planning");
  }
  if (itemActive(planning!, "/plan")) {
    throw new Error("admin-nav: Plan n’est pas un sous-onglet Planning");
  }
  if (adminNavForSession(false).some((item) => item.reunionOnly)) {
    throw new Error("admin-nav: Réunion masquée sans droit");
  }
}
runAdminNavSelfCheck();
