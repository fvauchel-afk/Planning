import { asAdminFlag } from "@/lib/auth/ids";

export type EmployeeAccess = {
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
  if (!url || !service || !employeeId) return null;

  const endpoint = new URL("/rest/v1/employees", url);
  endpoint.searchParams.set("id", `eq.${employeeId}`);
  endpoint.searchParams.set("select", "is_admin,actif");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    is_admin?: unknown;
    actif?: unknown;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    isAdmin: asAdminFlag(row.is_admin),
    actif: row.actif !== false,
  };
}
