"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { VEHICLE_COOKIE } from "@/lib/vehicle";

const SetSelectedCarSchema = z.object({
  carId: z.number().int().positive(),
});

/**
 * Server action qui persiste le véhicule sélectionné dans un cookie httpOnly.
 * Appelée par `<VehiclePicker>` quand l'utilisateur change de véhicule.
 * Revalide `/` pour rafraîchir le dashboard, le header et les listes filtrées.
 */
export async function setSelectedCarAction(carId: number): Promise<void> {
  const session = await requireSession();
  const parsed = SetSelectedCarSchema.safeParse({ carId });
  if (!parsed.success) {
    logger.warn(
      { event: "vehicle.select.invalid", user: session.userId, carId },
      "invalid carId on select",
    );
    return;
  }

  // Sanity check : le véhicule doit exister.
  const exists = await prisma.cars.findUnique({
    where: { id: parsed.data.carId },
    select: { id: true },
  });
  if (!exists) {
    logger.warn(
      { event: "vehicle.select.not_found", user: session.userId, carId },
      "carId not found",
    );
    return;
  }

  const store = await cookies();
  store.set(VEHICLE_COOKIE.name, String(parsed.data.carId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VEHICLE_COOKIE.maxAge,
  });

  logger.info(
    { event: "vehicle.select", user: session.userId, carId: parsed.data.carId },
    "vehicle selected",
  );

  revalidatePath("/", "layout");
}
