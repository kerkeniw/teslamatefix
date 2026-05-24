import bcrypt from "bcryptjs";

/**
 * Coût bcrypt : 12 rounds = ~250 ms par hash sur du matériel moderne.
 * Garde une marge significative contre les attaques offline mais reste
 * compatible avec un changement de mot de passe interactif (single-user).
 */
const BCRYPT_COST = 12;

/**
 * Hash un mot de passe avec bcrypt. Utilisé par l'action de changement
 * de mot de passe et par l'entrypoint Docker (au premier démarrage,
 * pour générer le hash de "admin").
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}
