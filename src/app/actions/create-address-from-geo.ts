"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { insertAddress } from "@/lib/addresses/insert";
import type { AddressFormValues } from "@/components/entities/addresses/AddressForm";
import type { FKOption } from "@/components/form/fk-combobox";

export type CreateAddressFromGeoResult =
  | { ok: true; option: FKOption; lat: number; lon: number }
  | { ok: false; error: string };

function labelFor(v: AddressFormValues): string {
  const line1 = [v.house_number, v.road].filter(Boolean).join(" ");
  const parts = [line1, v.city, v.country].filter((p) => p && p.trim() !== "");
  return parts.length > 0 ? parts.join(", ") : (v.display_name ?? "Adresse");
}

function parseRawJson(raw: string): Prisma.InputJsonValue | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Prisma.InputJsonValue;
  } catch {
    return null;
  }
}

/**
 * Crée (ou réutilise) une adresse à partir d'un candidat géocodé et renvoie
 * l'`FKOption` à sélectionner dans le combobox — SANS redirection (contrairement
 * à `createAddressAction`), pour l'usage inline dans l'assistant de trajet.
 */
export async function createAddressFromGeoAction(
  values: AddressFormValues,
): Promise<CreateAddressFromGeoResult> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  const lat = values.latitude != null ? Number(values.latitude) : NaN;
  const lon = values.longitude != null ? Number(values.longitude) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "Coordonnées de l'adresse manquantes." };
  }

  let id: number;
  try {
    id = await insertAddress({
      display_name: values.display_name ?? null,
      name: values.name ?? null,
      house_number: values.house_number ?? null,
      road: values.road ?? null,
      neighbourhood: values.neighbourhood ?? null,
      city: values.city ?? null,
      county: values.county ?? null,
      postcode: values.postcode ?? null,
      state: values.state ?? null,
      state_district: values.state_district ?? null,
      country: values.country ?? null,
      latitude: values.latitude ?? null,
      longitude: values.longitude ?? null,
      osm_id: values.osm_id ?? null,
      osm_type: values.osm_type ?? null,
      raw: parseRawJson(values.raw),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Une adresse identique existe déjà." };
    }
    logger.error(
      { event: "addresses.create_from_geo.error", err: String(e) },
      "createAddressFromGeo failed",
    );
    return { ok: false, error: "Impossible d'enregistrer l'adresse." };
  }

  logger.info(
    { event: "addresses.create_from_geo", user: session.userId, id },
    "addresses.create_from_geo",
  );
  revalidatePath("/addresses");

  return { ok: true, option: { id, label: labelFor(values) }, lat, lon };
}
