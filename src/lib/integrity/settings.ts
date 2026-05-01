import type { settings } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * `settings` est un singleton (id=1) géré par TeslaMate. On interdit toute
 * création depuis cette application : seuls les UPDATE sur la ligne id=1 sont
 * autorisés. Cette fonction encapsule cette règle pour qu'aucun caller ne
 * puisse créer une seconde ligne par mégarde.
 */
export type SettingsUpdateInput = {
  unit_of_length?: "km" | "mi";
  unit_of_temperature?: "C" | "F";
  unit_of_pressure?: "bar" | "psi";
  preferred_range?: "ideal" | "rated";
  base_url?: string | null;
  grafana_url?: string | null;
  language?: string;
};

export async function updateSettings(
  input: SettingsUpdateInput,
): Promise<settings> {
  return prisma.settings.update({
    where: { id: 1 },
    data: {
      ...input,
      updated_at: new Date(),
    },
  });
}
