import bcrypt from "bcryptjs";

export type EmployeePinRow = {
  id: string;
  nom: string;
  is_admin: unknown;
  actif: unknown;
  pin_hash: string;
};

/** Compare le PIN à chaque pin_hash (bcrypt pgcrypto). N’accepte jamais plusieurs matches. */
export async function employeesMatchingPin(
  pin: string,
  rows: EmployeePinRow[],
): Promise<EmployeePinRow[]> {
  const matches: EmployeePinRow[] = [];
  for (const row of rows) {
    const hash = row.pin_hash?.trim();
    if (!hash) continue;
    try {
      if (await bcrypt.compare(pin, hash)) matches.push(row);
    } catch {
      // Hash invalide : ignorer la ligne, ne pas authentifier.
    }
  }
  return matches;
}

function runPinVerifySelfCheck() {
  const mikaHash =
    "$2b$06$hvF82tGHA3SmhT5I5mqIxOU1c9GP2xpiv9mfFIrCgDVxrRmBMHyEy";
  const jonathanHash =
    "$2b$06$e5OJBwzUmAa/MebOLQfb6Oa4nebocRVECdGPjBAkNbm8xOSkLEAqG";
  if (!bcrypt.compareSync("7280", mikaHash) || bcrypt.compareSync("7280", jonathanHash)) {
    throw new Error("pin-verify: 7280 ne doit coller qu’au hash de Mika");
  }
  if (!bcrypt.compareSync("1111", jonathanHash) || bcrypt.compareSync("1111", mikaHash)) {
    throw new Error("pin-verify: 1111 ne doit coller qu’au hash de Jonathan");
  }
}

runPinVerifySelfCheck();
