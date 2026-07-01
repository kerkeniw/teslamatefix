import crypto from "node:crypto";

/**
 * Déchiffrement des valeurs stockées par TeslaMate via Cloak (`Cloak.Vault` +
 * `Cloak.Ciphers.AES.GCM`, cf. `../teslamate/lib/teslamate/vault.ex`).
 *
 * Format de l'enveloppe (identique au schéma documenté dans le Vault TeslaMate) :
 *
 *   +-------------------+---------------+----------------------+----------------------+
 *   | Key Tag (n bytes) | IV (12 bytes) | Ciphertag (16 bytes) | Ciphertext (n bytes) |
 *   +-------------------+---------------+----------------------+----------------------+
 *
 *   Key Tag = [ Type (1) | Length (1) | Value (Length) ]   →  ici [0x01][0x0A]"AES.GCM.V1"
 *
 * La clé AES-256 est dérivée par `SHA256(ENCRYPTION_KEY)` (TeslaMate hashe la clé
 * brute, cf. `default_cipher(:crypto.hash(:sha256, encryption_key))`).
 *
 * AAD de GCM : la constante `"AES256GCM"` utilisée par `cloak` (vérifiée
 * empiriquement — un token déchiffré doit être un JWT `ey...`).
 */

const IV_LENGTH = 12;
const TAG_LENGTH = 16; // ciphertag GCM
const AAD = Buffer.from("AES256GCM");
const TAG_TYPE_BINARY = 0x01;

/**
 * Dérive la clé AES-256 (32 octets) depuis l'ENCRYPTION_KEY brute de TeslaMate.
 */
export function deriveKey(encryptionKey: string): Buffer {
  return crypto.createHash("sha256").update(encryptionKey, "utf8").digest();
}

/**
 * Déchiffre un blob Cloak. Lève une erreur si l'enveloppe est malformée ou si
 * l'authentification GCM échoue (mauvaise clé). L'appelant est responsable du
 * try/catch — on ne veut jamais faire crasher un rendu de page pour ça.
 */
export function cloakDecrypt(blob: Buffer, encryptionKey: string): string {
  if (blob.length < 2) {
    throw new Error("cloak: enveloppe trop courte");
  }
  const tagType = blob[0];
  const tagLength = blob[1];
  if (tagType !== TAG_TYPE_BINARY) {
    throw new Error(`cloak: type de key tag inattendu (0x${tagType.toString(16)})`);
  }

  // Header = [type][length][value] ; le corps suit immédiatement.
  const headerEnd = 2 + tagLength;
  const ivEnd = headerEnd + IV_LENGTH;
  const tagEnd = ivEnd + TAG_LENGTH;
  if (blob.length <= tagEnd) {
    throw new Error("cloak: enveloppe incomplète (iv/ciphertag/ciphertext manquants)");
  }

  const iv = blob.subarray(headerEnd, ivEnd);
  const ciphertag = blob.subarray(ivEnd, tagEnd);
  const ciphertext = blob.subarray(tagEnd);

  const key = deriveKey(encryptionKey);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(ciphertag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
