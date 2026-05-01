import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Contraintes métier de la table `states` :
 * - CHECK DB : `end_date >= start_date`
 * - Invariant : un seul état avec `end_date IS NULL` par `car_id` (état « courant »).
 *
 * Avant d'insérer un nouvel état ouvert, on doit clôturer l'éventuel précédent
 * pour ne pas violer l'invariant. La clôture pose `end_date = newStartDate - 1s`
 * pour rester strictement antérieur au nouvel état (et respecter le CHECK :
 * `end_date >= start_date` du précédent — on suppose que la durée du précédent
 * est ≥ 1 seconde, ce qui est garanti par les pollers TeslaMate).
 *
 * Le client Prisma est passé en paramètre afin de pouvoir s'inscrire dans une
 * transaction `$transaction(...)` orchestrée par l'appelant.
 */
export async function closePreviousOpenState(
  carId: number,
  newStartDate: Date,
  tx: PrismaClient | Prisma.TransactionClient,
): Promise<{ closedId: number | null }> {
  const open = await tx.states.findFirst({
    where: { car_id: carId, end_date: null },
    select: { id: true, start_date: true },
  });
  if (!open) return { closedId: null };

  // 1 seconde avant le nouvel état (timestamp(6) supporte cette précision).
  const closeAt = new Date(newStartDate.getTime() - 1000);

  // Si l'état précédent commence après le nouveau, ses dates sont incohérentes :
  // on remonte à start_date pour rester ≥ start_date (CHECK), même si la
  // situation est anormale — mieux vaut une fermeture propre qu'une violation.
  const safeCloseAt =
    closeAt.getTime() < open.start_date.getTime() ? open.start_date : closeAt;

  await tx.states.update({
    where: { id: open.id },
    data: { end_date: safeCloseAt },
  });

  return { closedId: open.id };
}
