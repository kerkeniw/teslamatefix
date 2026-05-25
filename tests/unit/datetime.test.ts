import { describe, expect, it } from "vitest";
import {
  formatDateTimeIsoShort,
  formatDateTimeShort,
  formatLocalInputValue,
  formatOffsetLabel,
  getCurrentOffsetMinutes,
  isValidTimeZone,
  parseLocalInputToUtc,
} from "@/lib/format/datetime";

describe("isValidTimeZone", () => {
  it("accepte les identifiants IANA standards", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Pacific/Chatham")).toBe(true);
  });

  it("rejette les valeurs invalides", () => {
    expect(isValidTimeZone("Not/A_Zone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });
});

describe("formatLocalInputValue", () => {
  it("formate une Date UTC dans le fuseau cible", () => {
    // 2025-05-25 10:00 UTC = 12:00 Europe/Paris (CEST, UTC+2)
    const d = new Date("2025-05-25T10:00:00Z");
    expect(formatLocalInputValue(d, "Europe/Paris")).toBe(
      "2025-05-25T12:00:00",
    );
  });

  it("gère les fuseaux à offset négatif", () => {
    // 2025-05-25 10:00 UTC = 06:00 America/New_York (EDT, UTC-4)
    expect(formatLocalInputValue("2025-05-25T10:00:00Z", "America/New_York"))
      .toBe("2025-05-25T06:00:00");
  });

  it("gère les fuseaux à offset fractionnaire", () => {
    // 2025-05-25 10:00 UTC = 15:30 Asia/Kolkata (IST, UTC+5:30)
    expect(formatLocalInputValue("2025-05-25T10:00:00Z", "Asia/Kolkata"))
      .toBe("2025-05-25T15:30:00");
  });

  it("renvoie chaîne vide pour null/undefined/invalide", () => {
    expect(formatLocalInputValue(null, "Europe/Paris")).toBe("");
    expect(formatLocalInputValue(undefined, "Europe/Paris")).toBe("");
    expect(formatLocalInputValue("not a date", "Europe/Paris")).toBe("");
  });

  it("gère la transition DST automnale (recul Europe/Paris)", () => {
    // 2025-10-26 00:30 UTC = 02:30 CEST (avant bascule)
    expect(formatLocalInputValue("2025-10-26T00:30:00Z", "Europe/Paris"))
      .toBe("2025-10-26T02:30:00");
    // 2025-10-26 01:30 UTC = 02:30 CET (après bascule, ambiguïté visible)
    expect(formatLocalInputValue("2025-10-26T01:30:00Z", "Europe/Paris"))
      .toBe("2025-10-26T02:30:00");
  });
});

describe("parseLocalInputToUtc", () => {
  it("convertit une heure locale en UTC", () => {
    const d = parseLocalInputToUtc("2025-05-25T12:00:00", "Europe/Paris");
    expect(d?.toISOString()).toBe("2025-05-25T10:00:00.000Z");
  });

  it("accepte l'absence des secondes", () => {
    const d = parseLocalInputToUtc("2025-05-25T12:00", "Europe/Paris");
    expect(d?.toISOString()).toBe("2025-05-25T10:00:00.000Z");
  });

  it("gère les offsets fractionnaires", () => {
    const d = parseLocalInputToUtc("2025-05-25T15:30:00", "Asia/Kolkata");
    expect(d?.toISOString()).toBe("2025-05-25T10:00:00.000Z");
  });

  it("retourne null pour une string mal formée", () => {
    expect(parseLocalInputToUtc("invalid", "Europe/Paris")).toBeNull();
    expect(parseLocalInputToUtc("2025-05-25", "Europe/Paris")).toBeNull();
  });

  it("round-trip stable sur dates ordinaires", () => {
    const tzs = ["Europe/Paris", "America/New_York", "Asia/Tokyo", "UTC"];
    const samples = [
      "2025-05-25T12:00:00",
      "2025-01-01T00:00:00",
      "2025-12-31T23:59:59",
      "2026-02-28T08:15:30",
    ];
    for (const tz of tzs) {
      for (const s of samples) {
        const d = parseLocalInputToUtc(s, tz);
        expect(d).not.toBeNull();
        expect(formatLocalInputValue(d, tz)).toBe(s);
      }
    }
  });

  it("gère la transition DST printanière Europe/Paris (heure inexistante)", () => {
    // 2026-03-29 02:30 n'existe pas (saut 02:00 → 03:00). On accepte que
    // l'algorithme produise une heure cohérente côté UTC (résultat dans
    // [01:00, 02:00] UTC). Ce qui compte : pas de NaN, pas d'aller-retour
    // qui dérive d'1h hors fenêtre.
    const d = parseLocalInputToUtc("2026-03-29T02:30:00", "Europe/Paris");
    expect(d).not.toBeNull();
    expect(Number.isNaN(d!.getTime())).toBe(false);
    const ms = d!.getTime();
    expect(ms).toBeGreaterThanOrEqual(Date.UTC(2026, 2, 29, 0, 30));
    expect(ms).toBeLessThanOrEqual(Date.UTC(2026, 2, 29, 2, 30));
  });
});

describe("getCurrentOffsetMinutes / formatOffsetLabel", () => {
  it("retourne 0 pour UTC", () => {
    expect(getCurrentOffsetMinutes("UTC", new Date("2025-05-25T10:00:00Z")))
      .toBe(0);
  });

  it("retourne +120 pour Europe/Paris en été", () => {
    expect(
      getCurrentOffsetMinutes("Europe/Paris", new Date("2025-07-15T10:00:00Z")),
    ).toBe(120);
  });

  it("retourne +60 pour Europe/Paris en hiver", () => {
    expect(
      getCurrentOffsetMinutes("Europe/Paris", new Date("2025-01-15T10:00:00Z")),
    ).toBe(60);
  });

  it("retourne -240 pour America/New_York en été (EDT)", () => {
    expect(
      getCurrentOffsetMinutes(
        "America/New_York",
        new Date("2025-07-15T10:00:00Z"),
      ),
    ).toBe(-240);
  });

  it("retourne +330 pour Asia/Kolkata", () => {
    expect(
      getCurrentOffsetMinutes("Asia/Kolkata", new Date("2025-07-15T10:00:00Z")),
    ).toBe(330);
  });

  it("formate les labels", () => {
    expect(formatOffsetLabel(0)).toBe("UTC+00:00");
    expect(formatOffsetLabel(120)).toBe("UTC+02:00");
    expect(formatOffsetLabel(-240)).toBe("UTC-04:00");
    expect(formatOffsetLabel(330)).toBe("UTC+05:30");
    expect(formatOffsetLabel(-570)).toBe("UTC-09:30");
  });
});

describe("formatDateTimeShort / formatDateTimeIsoShort", () => {
  it("formatDateTimeIsoShort produit `YYYY-MM-DD HH:mm` dans la TZ", () => {
    expect(
      formatDateTimeIsoShort("2025-05-25T10:00:00Z", "Europe/Paris"),
    ).toBe("2025-05-25 12:00");
    expect(
      formatDateTimeIsoShort("2025-05-25T10:00:00Z", "America/New_York"),
    ).toBe("2025-05-25 06:00");
  });

  it("formatDateTimeShort produit `dd/MM/yyyy HH:mm` en fr", () => {
    const out = formatDateTimeShort(
      "2025-05-25T10:00:00Z",
      "Europe/Paris",
      "fr-FR",
    );
    expect(out).toBe("25/05/2025 12:00");
  });
});
