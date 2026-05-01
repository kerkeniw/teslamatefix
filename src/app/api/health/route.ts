/**
 * Healthcheck Docker — n'effectue aucune requête DB pour rester rapide et utilisable
 * y compris si la base est temporairement injoignable. Un endpoint /api/health/db
 * pourra être ajouté plus tard si besoin.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
