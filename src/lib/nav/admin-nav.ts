export type AdminNavLink = {
  href: string;
  label: string;
  /** false = pas de prefetch Next (OneDrive). */
  prefetch?: boolean;
  reunionOnly?: boolean;
};

export type AdminNavItem = AdminNavLink & {
  children?: AdminNavLink[];
};

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/synthese", label: "Synthèse" },
  { href: "/devis", label: "Devis" },
  {
    href: "/",
    label: "Planning",
    children: [{ href: "/chantiers", label: "Chantiers" }],
  },
  {
    href: "/demandes",
    label: "Demandes",
    children: [
      { href: "/reunion", label: "Réunion", reunionOnly: true },
      { href: "/commandes", label: "Commande" },
    ],
  },
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
  { href: "/absences", label: "Absences" },
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
  return ADMIN_NAV.filter((item) => !item.reunionOnly || canManageReunion).map(
    (item) => {
      const children = (item.children ?? []).filter(
        (child) => !child.reunionOnly || canManageReunion,
      );
      return children.length === (item.children ?? []).length
        ? item
        : { ...item, children };
    },
  );
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
    "Demandes",
    "Signalements",
    "Paramètres",
    "Plan",
    "Absences",
    "Mon planning",
  ];
  if (labels.join("|") !== expected.join("|")) {
    throw new Error(`admin-nav: ordre inattendu (${labels.join(", ")})`);
  }
  const planning = ADMIN_NAV.find((item) => item.href === "/");
  if (planning?.children?.[0]?.href !== "/chantiers") {
    throw new Error("admin-nav: Chantiers doit être sous Planning");
  }
  const demandes = ADMIN_NAV.find((item) => item.href === "/demandes");
  const demandeChildren = (demandes?.children ?? []).map((item) => item.href);
  if (demandeChildren.join("|") !== "/reunion|/commandes") {
    throw new Error("admin-nav: Réunion et Commande sous Demandes");
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
  if (itemActive(demandes!, "/commandes") !== true) {
    throw new Error("admin-nav: /commandes doit activer Demandes");
  }
  if (itemActive(demandes!, "/reunion") !== true) {
    throw new Error("admin-nav: /reunion doit activer Demandes");
  }
  if (adminNavForSession(false).some((item) => item.reunionOnly)) {
    throw new Error("admin-nav: Réunion masquée sans droit");
  }
  const withoutReunion = adminNavForSession(false).find(
    (item) => item.href === "/demandes",
  );
  if ((withoutReunion?.children ?? []).some((item) => item.href === "/reunion")) {
    throw new Error("admin-nav: Réunion masquée dans les sous-onglets sans droit");
  }
  if (!(withoutReunion?.children ?? []).some((item) => item.href === "/commandes")) {
    throw new Error("admin-nav: Commande reste visible sous Demandes");
  }
}
runAdminNavSelfCheck();
