/**
 * Healthcheck profond : ping Postgres. Utile pour readiness probes Kubernetes
 * ou docker-compose `healthcheck` plus stricts. À la différence de /api/health
 * (rapide, indépendant de la DB), cette route ouvre une connexion Prisma.
 */
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch (err) {
    logger.error({ event: "health.db.error", err: String(err) }, "DB ping failed");
    return Response.json(
      { status: "degraded", db: "unreachable" },
      { status: 503 },
    );
  }
}
