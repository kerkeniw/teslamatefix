import { describe, expect, it } from "vitest";
import { pickNearestByDate } from "@/lib/integrity/nearest-by-date";

/**
 * Tests purs de la sélection de la mesure la plus proche d'une date de
 * référence (utilisée pour estimer la capacité batterie « à la période »).
 */

type Sample = { date: Date; value: number };

const ref = new Date("2024-06-01T12:00:00.000Z");
const refMs = ref.getTime();

describe("pickNearestByDate", () => {
  it("retourne null si aucune mesure", () => {
    expect(pickNearestByDate<Sample>(null, null, refMs)).toBeNull();
  });

  it("retourne l'unique mesure disponible (avant seule)", () => {
    const before: Sample = { date: new Date("2024-05-01T12:00:00Z"), value: 1 };
    expect(pickNearestByDate(before, null, refMs)).toBe(before);
  });

  it("retourne l'unique mesure disponible (après seule)", () => {
    const after: Sample = { date: new Date("2024-07-01T12:00:00Z"), value: 2 };
    expect(pickNearestByDate(null, after, refMs)).toBe(after);
  });

  it("choisit la mesure la plus proche dans le temps (avant plus proche)", () => {
    const before: Sample = { date: new Date("2024-05-30T12:00:00Z"), value: 1 }; // -2 j
    const after: Sample = { date: new Date("2024-06-10T12:00:00Z"), value: 2 }; // +9 j
    expect(pickNearestByDate(before, after, refMs)).toBe(before);
  });

  it("choisit la mesure la plus proche dans le temps (après plus proche)", () => {
    const before: Sample = { date: new Date("2024-04-01T12:00:00Z"), value: 1 }; // ~-61 j
    const after: Sample = { date: new Date("2024-06-03T12:00:00Z"), value: 2 }; // +2 j
    expect(pickNearestByDate(before, after, refMs)).toBe(after);
  });

  it("en cas d'égalité stricte, privilégie l'antérieure (déterministe)", () => {
    const before: Sample = { date: new Date("2024-05-31T12:00:00Z"), value: 1 }; // -1 j
    const after: Sample = { date: new Date("2024-06-02T12:00:00Z"), value: 2 }; // +1 j
    expect(pickNearestByDate(before, after, refMs)).toBe(before);
  });
});
