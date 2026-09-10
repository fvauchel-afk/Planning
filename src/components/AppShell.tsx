import Link from "next/link";
import { OnedriveBanner } from "@/components/OnedriveBanner";

const LINKS: { href: string; label: string; desktopOnly?: boolean }[] = [
  { href: "/", label: "Planning" },
  { href: "/synthese", label: "Synthèse" },
  { href: "/chantiers/nouveau", label: "Nouveau chantier" },
  { href: "/employes", label: "Employés" },
  { href: "/absences", label: "Absences" },
  { href: "/signalements", label: "Signalements", desktopOnly: true },
  { href: "/admin/onedrive", label: "OneDrive", desktopOnly: true },
  { href: "/moi", label: "Mon planning" },
];

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-800 bg-stone-900 text-stone-100">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-amber-500">
              Métallerie
            </p>
            <h1 className="font-serif text-xl leading-tight text-stone-50">
              Ferronnerie Vauchel
            </h1>
          </div>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? currentPath === "/"
                  : currentPath.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    link.desktopOnly ? "hidden md:inline-flex" : ""
                  } ${
                    active
                      ? "bg-amber-700 text-amber-50"
                      : "text-stone-300 hover:bg-stone-800 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">
        <OnedriveBanner />
        {children}
      </main>
    </div>
  );
}
