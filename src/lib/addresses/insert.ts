/**
 * Helper d'insertion d'une adresse, partagé entre `createAddressAction`
 * (formulaire manuel) et `createAddressFromGeoAction` (adresse géocodée).
 * Gère la déduplication sur le couple unique (osm_id, osm_type) : si une adresse
 * existe déjà pour ce couple, on la réutilise au lieu d'insérer.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AddressInsert = {
  display_name: string | null;
  name: string | null;
  house_number: string | null;
  road: string | null;
  neighbourhood: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  state: string | null;
  state_district: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  osm_id: string | null;
  osm_type: string | null;
  raw: Prisma.InputJsonValue | null;
};

/**
 * Insère (ou réutilise) une adresse et renvoie son id. Lève les erreurs Prisma
 * telles quelles (le caller gère P2002/P2003).
 */
export async function insertAddress(data: AddressInsert): Promise<number> {
  // Déduplication : même (osm_id, osm_type) → adresse déjà connue.
  if (data.osm_id && data.osm_type) {
    const existing = await prisma.addresses.findFirst({
      where: { osm_id: BigInt(data.osm_id), osm_type: data.osm_type },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const now = new Date();
  const created = await prisma.addresses.create({
    data: {
      display_name: data.display_name,
      name: data.name,
      house_number: data.house_number,
      road: data.road,
      neighbourhood: data.neighbourhood,
      city: data.city,
      county: data.county,
      postcode: data.postcode,
      state: data.state,
      state_district: data.state_district,
      country: data.country,
      latitude: data.latitude ? new Prisma.Decimal(data.latitude) : null,
      longitude: data.longitude ? new Prisma.Decimal(data.longitude) : null,
      osm_id: data.osm_id ? BigInt(data.osm_id) : null,
      osm_type: data.osm_type,
      raw: data.raw === null ? Prisma.DbNull : data.raw,
      inserted_at: now,
      updated_at: now,
    },
    select: { id: true },
  });
  return created.id;
}
