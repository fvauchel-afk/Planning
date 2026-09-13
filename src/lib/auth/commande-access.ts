/**
 * Les commandes (matériel, outillage…) sont destinées à Alexis et Mika.
 * (Michael est accepté si c’est le nom enregistré pour Mika.)
 */
import { normalizePersonName } from "@/lib/auth/restore-access";

export function canReceiveCommandes(nom: string | null | undefined): boolean {
  const key = normalizePersonName(nom ?? "");
  const first = key.split(/\s+/)[0] ?? "";
  return first === "alexis" || first === "mika" || first === "michael";
}

function runCommandeAccessSelfCheck() {
  if (!canReceiveCommandes("Alexis") || !canReceiveCommandes("Mika")) {
    throw new Error("commande-access: Alexis et Mika doivent recevoir les commandes");
  }
  if (!canReceiveCommandes("Michael")) {
    throw new Error("commande-access: Michael (Mika) doit recevoir les commandes");
  }
  if (
    !canReceiveCommandes("Alexis Vauchel") ||
    !canReceiveCommandes("Mika ")
  ) {
    throw new Error("commande-access: le prénom suffit même avec un nom de famille");
  }
  if (canReceiveCommandes("Jonathan") || canReceiveCommandes("Romain")) {
    throw new Error("commande-access: les autres comptes ne reçoivent pas les commandes");
  }
}
runCommandeAccessSelfCheck();
