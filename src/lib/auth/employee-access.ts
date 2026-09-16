import { asAdminFlag, normalizeId } from "@/lib/auth/ids";

export type EmployeeAccess = {
  id: string;
  nom: string;
  isAdmin: boolean;
  actif: boolean;
};

export async function lookupEmployeeAccess(
  employeeId: string,
): Promise<EmployeeAccess | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  )?.trim();
  const id = normalizeId(employeeId) || employeeId.trim();
  if (!url || !service || !id) return null;

  const endpoint = new URL("/rest/v1/employees", url);
  endpoint.searchParams.set("id", `eq.${id}`);
  endpoint.searchParams.set("select", "id,nom,is_admin,actif");
  endpoint.searchParams.set("limit", "1");

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      id?: unknown;
      nom?: unknown;
      is_admin?: unknown;
      actif?: unknown;
    }>;
    const row = rows[0];
    if (!row?.id || row.nom == null) return null;
    return {
      id: String(row.id),
      nom: String(row.nom),
      isAdmin: asAdminFlag(row.is_admin),
      actif: row.actif !== false,
    };
  } catch {
    return null;
  }
}

/** Admin Jonathan actif, pour l’ouverture temporaire sans PIN. */
export async function lookupJonathanAdmin(): Promise<EmployeeAccess | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  )?.trim();
  if (!url || !service) return null;

  const endpoint = new URL("/rest/v1/employees", url);
  endpoint.searchParams.set("nom", "eq.Jonathan");
  endpoint.searchParams.set("actif", "eq.true");
  endpoint.searchParams.set("select", "id,nom,is_admin,actif");
  endpoint.searchParams.set("limit", "5");

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: service,
        Authorization: `Bearer ${service}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{
      id?: unknown;
      nom?: unknown;
      is_admin?: unknown;
      actif?: unknown;
    }>;
    for (const row of rows) {
      if (!row?.id || row.nom == null) continue;
      const access: EmployeeAccess = {
        id: String(row.id),
        nom: String(row.nom),
        isAdmin: asAdminFlag(row.is_admin),
        actif: row.actif !== false,
      };
      if (access.actif && access.isAdmin) return access;
    }
    return null;
  } catch {
    return null;
  }
}
