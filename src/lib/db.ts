import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma 7 : connexion par l'adaptateur `pg` (plus de moteur Rust). Le pool de
 * `pg` n'a pas de délai de connexion par défaut ; on reprend les 5 s de
 * Prisma 6 pour qu'une base injoignable échoue vite (sonde de santé, pages).
 */
function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: prismaLogLevels(process.env.PRISMA_LOG) });
}

const PRISMA_LOG_LEVELS = ["query", "info", "warn", "error"] as const;
type PrismaLogLevel = (typeof PRISMA_LOG_LEVELS)[number];

/**
 * Journaux Prisma désactivés par défaut : les erreurs remontent aux server
 * actions, qui les journalisent sans payload (`safeErr`), alors que le journal
 * `error` de Prisma recopie les arguments de la requête. Pour diagnostiquer :
 * `PRISMA_LOG=query,warn,error` (liste séparée par des virgules).
 */
export function prismaLogLevels(value: string | undefined): PrismaLogLevel[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is PrismaLogLevel => (PRISMA_LOG_LEVELS as readonly string[]).includes(s));
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
