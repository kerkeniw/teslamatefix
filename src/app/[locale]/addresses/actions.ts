"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { AddressFormState } from "@/components/entities/addresses/AddressForm";

type AddressFieldErrors = NonNullable<AddressFormState["fieldErrors"]>;

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const optionalDecimal = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine(
      (v) => {
        if (v == null) return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max;
      },
      { message: "out_of_range" },
    );

const AddressInputSchema = z.object({
  display_name: optionalString(512),
  name: optionalString(255),
  house_number: optionalString(255),
  road: optionalString(255),
  neighbourhood: optionalString(255),
  city: optionalString(255),
  county: optionalString(255),
  postcode: optionalString(255),
  state: optionalString(255),
  state_district: optionalString(255),
  country: optionalString(255),
  latitude: optionalDecimal(-90, 90),
  longitude: optionalDecimal(-180, 180),
  raw: z
    .string()
    .transform((v) => v.trim())
    .optional()
    .default(""),
});

function parseRaw(raw: string): { ok: true; value: Prisma.InputJsonValue | null } | { ok: false } {
  if (raw === "") return { ok: true, value: null };
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as Prisma.InputJsonValue };
  } catch {
    return { ok: false };
  }
}

function readOnlyResult(): AddressFormState {
  return { ok: false, error: "Application en lecture seule." };
}

export async function createAddressAction(
  _prev: AddressFormState | null,
  formData: FormData,
): Promise<AddressFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = AddressInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: AddressFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string") {
        fieldErrors[path as keyof AddressFieldErrors] = issue.message;
      }
    }
    return { ok: false, error: "Données invalides.", fieldErrors };
  }

  const rawJson = parseRaw(parsed.data.raw ?? "");
  if (!rawJson.ok) {
    return {
      ok: false,
      fieldErrors: { raw: "Le JSON brut n'est pas un objet valide." },
    };
  }

  const data = parsed.data;
  const now = new Date();

  let createdId: number;
  try {
    const created = await prisma.addresses.create({
      data: {
        display_name: data.display_name ?? null,
        name: data.name ?? null,
        house_number: data.house_number ?? null,
        road: data.road ?? null,
        neighbourhood: data.neighbourhood ?? null,
        city: data.city ?? null,
        county: data.county ?? null,
        postcode: data.postcode ?? null,
        state: data.state ?? null,
        state_district: data.state_district ?? null,
        country: data.country ?? null,
        latitude: data.latitude ? new Prisma.Decimal(data.latitude) : null,
        longitude: data.longitude ? new Prisma.Decimal(data.longitude) : null,
        raw: rawJson.value === null ? Prisma.DbNull : rawJson.value,
        inserted_at: now,
        updated_at: now,
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Une autre adresse utilise déjà ce couple (osm_id, osm_type)." };
    }
    logger.error({ event: "addresses.create.error", err: String(e) }, "addresses.create failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "addresses.create",
      user: session.userId,
      id: createdId,
      diff_keys: Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] != null),
    },
    "addresses.create",
  );

  revalidatePath("/addresses");
  redirect(`/addresses/${createdId}`);
}

export async function updateAddressAction(
  id: number,
  _prev: AddressFormState | null,
  formData: FormData,
): Promise<AddressFormState> {
  const session = await requireSession();
  if (env.READ_ONLY) return readOnlyResult();

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = AddressInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: AddressFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path[0];
      if (typeof path === "string") {
        fieldErrors[path as keyof AddressFieldErrors] = issue.message;
      }
    }
    return { ok: false, error: "Données invalides.", fieldErrors };
  }

  const rawJson = parseRaw(parsed.data.raw ?? "");
  if (!rawJson.ok) {
    return {
      ok: false,
      fieldErrors: { raw: "Le JSON brut n'est pas un objet valide." },
    };
  }

  const data = parsed.data;
  const diffKeys = Object.keys(data);

  try {
    await prisma.addresses.update({
      where: { id },
      data: {
        display_name: data.display_name ?? null,
        name: data.name ?? null,
        house_number: data.house_number ?? null,
        road: data.road ?? null,
        neighbourhood: data.neighbourhood ?? null,
        city: data.city ?? null,
        county: data.county ?? null,
        postcode: data.postcode ?? null,
        state: data.state ?? null,
        state_district: data.state_district ?? null,
        country: data.country ?? null,
        latitude: data.latitude ? new Prisma.Decimal(data.latitude) : null,
        longitude: data.longitude ? new Prisma.Decimal(data.longitude) : null,
        raw: rawJson.value === null ? Prisma.DbNull : rawJson.value,
        updated_at: new Date(),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return { ok: false, error: "Adresse introuvable." };
      if (e.code === "P2002") {
        return { ok: false, error: "Une autre adresse utilise déjà ce couple (osm_id, osm_type)." };
      }
    }
    logger.error({ event: "addresses.update.error", id, err: String(e) }, "addresses.update failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info(
    {
      event: "addresses.update",
      user: session.userId,
      id,
      diff_keys: diffKeys,
    },
    "addresses.update",
  );

  revalidatePath("/addresses");
  revalidatePath(`/addresses/${id}`);
  return { ok: true };
}

export async function deleteAddressAction(id: number): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (env.READ_ONLY) return { ok: false, error: "Application en lecture seule." };

  try {
    await prisma.addresses.delete({ where: { id } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return { ok: false, error: "Adresse introuvable." };
    }
    logger.error({ event: "addresses.delete.error", id, err: String(e) }, "addresses.delete failed");
    return { ok: false, error: "Une erreur est survenue." };
  }

  logger.info({ event: "addresses.delete", user: session.userId, id }, "addresses.delete");
  revalidatePath("/addresses");
  return { ok: true };
}
