import { idsEqual, normalizeId } from "@/lib/auth/ids";

export type PinLoginRow = {
  id: string;
  nom: string;
  is_admin: unknown;
};

export type ExclusiveLogin =
  | { status: "ok"; row: PinLoginRow }
  | { status: "empty" }
  | { status: "ambiguous" };

export function rpcDataToLoginRows(data: unknown): PinLoginRow[] {
  if (data == null) return [];
  const list = Array.isArray(data) ? data : [data];
  const rows: PinLoginRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = row.id == null ? "" : String(row.id).trim();
    const nom = row.nom == null ? "" : String(row.nom);
    if (!id || !nom.trim()) continue;
    rows.push({ id, nom, is_admin: row.is_admin });
  }
  return rows;
}

/** Un PIN valide ne peut correspondre qu’à un seul employé. */
export function exclusiveLoginRow(rows: PinLoginRow[]): ExclusiveLogin {
  if (rows.length === 0) return { status: "empty" };
  if (rows.length > 1) return { status: "ambiguous" };
  return { status: "ok", row: rows[0]! };
}

export function sessionMatchesVerifiedEmployee(
  session: { employeeId: string; nom: string },
  employee: { id: string; nom: string },
): boolean {
  return (
    idsEqual(session.employeeId, employee.id) &&
    session.nom.trim() === employee.nom.trim()
  );
}

export function verifiedSessionFromEmployee(employee: {
  id: string;
  nom: string;
  is_admin: boolean;
}): { employeeId: string; nom: string; isAdmin: boolean } {
  return {
    employeeId: normalizeId(employee.id) || employee.id,
    nom: employee.nom.trim(),
    isAdmin: employee.is_admin,
  };
}

/** Contrôles purs : un PIN ne doit jamais coller à Jonathan si la ligne validée est Mika. */
export function runLoginIdentitySelfCheck(): void {
  const mika: PinLoginRow = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
    nom: "Mika",
    is_admin: false,
  };
  const jonathan: PinLoginRow = {
    id: "11111111-1111-4111-8111-111111111111",
    nom: "Jonathan",
    is_admin: true,
  };

  const fromArray = rpcDataToLoginRows([mika]);
  const picked = exclusiveLoginRow(fromArray);
  if (picked.status !== "ok" || picked.row.nom !== "Mika") {
    throw new Error("login-identity: une seule ligne RPC doit être acceptée");
  }

  const collision = exclusiveLoginRow([mika, jonathan]);
  if (collision.status !== "ambiguous") {
    throw new Error(
      "login-identity: plusieurs lignes pour un même PIN doivent être rejetées",
    );
  }

  if (exclusiveLoginRow([]).status !== "empty") {
    throw new Error("login-identity: zéro ligne doit rester vide");
  }

  const session = verifiedSessionFromEmployee({
    id: mika.id,
    nom: mika.nom,
    is_admin: false,
  });
  if (
    !sessionMatchesVerifiedEmployee(session, { id: mika.id, nom: "Mika" }) ||
    sessionMatchesVerifiedEmployee(session, {
      id: jonathan.id,
      nom: "Jonathan",
    })
  ) {
    throw new Error(
      "login-identity: la session doit coller à l’employé du pin_hash, pas à un admin de secours",
    );
  }
}

runLoginIdentitySelfCheck();
