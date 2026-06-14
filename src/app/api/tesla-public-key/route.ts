import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { logger } from "@/lib/logger";

/**
 * Sert la clé publique EC exigée par Tesla pour valider le domaine de
 * l'application Fleet API (étape « partner registration »).
 *
 * URL publique canonique attendue par Tesla :
 *   /.well-known/appspecific/com.tesla.3p.public-key.pem
 * Elle est mappée vers cette route via un `rewrite` dans `next.config.ts`.
 *
 * Cette route est déclarée **publique** dans `src/proxy.ts` (pas d'auth) :
 * Tesla doit pouvoir lire le fichier sans session. La clé est publique par
 * nature — seul le `private-key.pem` reste secret et n'est jamais servi ici.
 *
 * Le fichier est monté en lecture seule dans le container (volume Docker) et
 * lu à chaud à chaque requête : on peut donc faire tourner la clé sans
 * rebuild ni redémarrage. Chemin configurable via `TESLA_PUBLIC_KEY_FILE`.
 */
export const dynamic = "force-dynamic";

const PUBLIC_KEY_FILE =
  process.env.TESLA_PUBLIC_KEY_FILE?.trim() ||
  "/well-known/com.tesla.3p.public-key.pem";

export async function GET() {
  try {
    const pem = await readFile(PUBLIC_KEY_FILE, "utf8");
    return new NextResponse(pem, {
      status: 200,
      headers: {
        "Content-Type": "application/x-pem-file",
        // Clé publique mais susceptible de tourner : pas de cache agressif.
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    logger.error(
      { err, file: PUBLIC_KEY_FILE },
      "tesla.public_key.read_error",
    );
    return new NextResponse("Tesla public key not configured", {
      status: 404,
    });
  }
}
