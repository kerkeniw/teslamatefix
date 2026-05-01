import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    update: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: { settings: mocks.settings },
}));

import { updateSettings } from "@/lib/integrity/settings";

beforeEach(() => {
  mocks.settings.update.mockReset();
  mocks.settings.create.mockReset();
  mocks.settings.upsert.mockReset();
});

describe("integrity/settings — updateSettings", () => {
  it("appelle uniquement update avec where {id: 1}", async () => {
    mocks.settings.update.mockResolvedValue({ id: 1, unit_of_length: "km" });
    await updateSettings({ unit_of_length: "km" });

    expect(mocks.settings.update).toHaveBeenCalledTimes(1);
    const args = mocks.settings.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 1 });
    expect(args.data.unit_of_length).toBe("km");
    // updated_at est positionné automatiquement
    expect(args.data.updated_at).toBeInstanceOf(Date);
  });

  it("n'appelle JAMAIS create ni upsert (singleton)", async () => {
    mocks.settings.update.mockResolvedValue({ id: 1 });
    await updateSettings({ unit_of_temperature: "C" });

    expect(mocks.settings.create).not.toHaveBeenCalled();
    expect(mocks.settings.upsert).not.toHaveBeenCalled();
  });

  it("propage tous les champs fournis et seulement ceux-là", async () => {
    mocks.settings.update.mockResolvedValue({ id: 1 });
    await updateSettings({
      unit_of_length: "mi",
      unit_of_temperature: "F",
      preferred_range: "rated",
      base_url: null,
      grafana_url: "https://grafana.local",
      language: "en",
    });
    const args = mocks.settings.update.mock.calls[0][0];
    expect(args.data).toMatchObject({
      unit_of_length: "mi",
      unit_of_temperature: "F",
      preferred_range: "rated",
      base_url: null,
      grafana_url: "https://grafana.local",
      language: "en",
    });
  });
});
