import { describe, expect, it } from "vitest";
import {
  ChargingCsvError,
  chargerKind,
  parseChargingCsv,
  parseCsv,
  type TeslaChargeSession,
} from "@/lib/privacy/charging-csv";
import { compareCharges, type TmChargeSession } from "@/lib/privacy/compare";
import { EMPTY_STORE, mergeImport } from "@/lib/privacy/merge";

const VIN = "TESTVIN0000000001";
const HEADER =
  "VIN,Charge Start Time (UTC),Charge End Time (UTC),Charge Duration (s),Energy Added (kWh),Charger Type,Location";

function tesla(start: string, end: string, kwh: number, type = "General - AC power"): TeslaChargeSession {
  return {
    vin: VIN,
    start: `${start}Z`,
    end: `${end}Z`,
    durationS: (Date.parse(`${end}Z`) - Date.parse(`${start}Z`)) / 1000,
    energyAddedKwh: kwh,
    chargerType: type,
    kind: chargerKind(type),
    location: "Home",
  };
}

function tm(id: number, start: string, end: string, kwh: number | null, open = false): TmChargeSession {
  return { id, carId: 1, start: `${start}Z`, end: `${end}Z`, open, energyAddedKwh: kwh };
}

const cars = new Map([[VIN, 1]]);

describe("privacy/charging-csv", () => {
  it("parse le CSV réel (BOM, UTC sans fuseau)", () => {
    const csv = `﻿${HEADER}\r\n${VIN},2026-06-11 22:05:41,2026-06-12 02:36:30,16249,31.4,General - AC power,Home\r\n`;
    const [s] = parseChargingCsv(csv);
    expect(s).toMatchObject({
      vin: VIN,
      start: "2026-06-11T22:05:41.000Z",
      end: "2026-06-12T02:36:30.000Z",
      durationS: 16249,
      energyAddedKwh: 31.4,
      kind: "AC",
      location: "Home",
    });
  });

  it("gère les champs entre guillemets et les guillemets échappés", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n')).toEqual([["a", "b, c", 'd "e"']]);
  });

  it("classe les bornes DC", () => {
    expect(chargerKind("Europe Supercharger")).toBe("DC");
    expect(chargerKind("Third Party CCS station (Combo charger)")).toBe("DC");
    expect(chargerKind("Gen 2 Mobile Connector")).toBe("AC");
    expect(chargerKind("General - AC power")).toBe("AC");
  });

  it("refuse un autre fichier de l'export", () => {
    expect(() => parseChargingCsv("VIN,YEAR,MODEL\nX,2025,Model Y\n")).toThrow(ChargingCsvError);
  });

  it("signale la ligne invalide", () => {
    expect(() => parseChargingCsv(`${HEADER}\n${VIN},pas une date,,,1,AC,Home\n`)).toThrow(/Ligne 2/);
  });
});

describe("privacy/compare — compareCharges", () => {
  it("ok : même recharge, TeslaMate démarre quelques minutes plus tard", () => {
    const r = compareCharges(
      [tesla("2026-07-17T07:30:05", "2026-07-17T09:00:00", 4.6)],
      [tm(192, "2026-07-17T07:41:25", "2026-07-17T09:02:53", 4.5)],
      cars,
    );
    expect(r.groups.map((g) => g.kind)).toEqual(["ok"]);
    expect(r.toFix).toBe(0);
  });

  it("ok : 3 sessions Tesla regroupées dans 1 session TeslaMate (cas #273)", () => {
    const r = compareCharges(
      [
        tesla("2026-08-09T14:55:02", "2026-08-09T14:58:00", 0.1),
        tesla("2026-08-09T15:00:06", "2026-08-09T15:45:00", 1.58),
        tesla("2026-08-09T15:50:30", "2026-08-09T16:50:00", 3.52),
      ],
      [tm(273, "2026-08-09T14:55:06", "2026-08-09T16:50:52", 5.2)],
      cars,
    );
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ kind: "ok", teslaKwh: 5.2, tmKwh: 5.2 });
  });

  it("fragmented : 1 recharge Tesla coupée en 2 par TeslaMate (cas #248 + #249)", () => {
    const r = compareCharges(
      [tesla("2026-07-30T00:56:27", "2026-07-30T06:10:00", 15.08)],
      [
        tm(248, "2026-07-30T00:58:27", "2026-07-30T02:09:41", 2.42, true),
        tm(249, "2026-07-30T02:14:27", "2026-07-30T06:11:05", 12.48),
      ],
      cars,
    );
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].kind).toBe("fragmented");
    expect(r.groups[0].tm.map((s) => s.id)).toEqual([248, 249]);
    expect(r.toFix).toBe(1);
  });

  it("ok : les deux sources découpent pareil", () => {
    const r = compareCharges(
      [
        tesla("2026-07-18T05:16:00", "2026-07-18T05:40:00", 1),
        tesla("2026-07-18T05:45:00", "2026-07-18T06:10:00", 1),
      ],
      [
        tm(196, "2026-07-18T05:17:00", "2026-07-18T05:40:00", 1),
        tm(197, "2026-07-18T05:46:00", "2026-07-18T06:10:00", 1),
      ],
      cars,
    );
    expect(r.counts.ok).toBe(1);
    expect(r.counts.fragmented).toBe(0);
  });

  it("energy_mismatch : écart au-delà de 0,5 kWh et 5 %", () => {
    const r = compareCharges(
      [tesla("2026-07-17T07:30:05", "2026-07-17T09:00:00", 5.12)],
      [tm(192, "2026-07-17T07:41:25", "2026-07-17T09:02:53", 4.44)],
      cars,
    );
    expect(r.groups[0]).toMatchObject({ kind: "energy_mismatch", diffKwh: -0.68 });
  });

  it("missing : recharge absente de TeslaMate, mineure sous 0,5 kWh", () => {
    const r = compareCharges(
      [
        tesla("2026-08-26T10:44:16", "2026-08-26T11:31:23", 63.3, "Europe Supercharger"),
        tesla("2026-08-27T00:00:00", "2026-08-27T00:05:00", 0.06),
      ],
      [],
      cars,
    );
    expect(r.groups.map((g) => [g.kind, g.severity, g.teslaKind])).toEqual([
      ["missing", "warn", "DC"],
      ["missing", "info", "AC"],
    ]);
    expect(r.toFix).toBe(1);
  });

  it("extra : session TeslaMate vide à supprimer", () => {
    const r = compareCharges(
      [
        tesla("2026-07-20T10:00:00", "2026-07-20T11:00:00", 5),
        tesla("2026-07-21T10:00:00", "2026-07-21T11:00:00", 3),
      ],
      [
        tm(208, "2026-07-20T10:02:00", "2026-07-20T11:00:00", 5),
        tm(209, "2026-07-20T15:50:49", "2026-07-20T15:51:53", 0),
        tm(210, "2026-07-21T10:01:00", "2026-07-21T11:00:00", 3),
      ],
      cars,
    );
    const extra = r.groups.find((g) => g.kind === "extra");
    expect(extra?.emptyExtra).toBe(true);
    expect(extra?.tm[0].id).toBe(209);
  });

  it("ignore les sessions TeslaMate hors de la période de l'export", () => {
    const r = compareCharges(
      [tesla("2026-07-20T10:00:00", "2026-07-20T11:00:00", 5)],
      [
        tm(1, "2026-07-20T10:02:00", "2026-07-20T11:00:00", 5),
        tm(2, "2026-09-01T10:00:00", "2026-09-01T11:00:00", 10),
      ],
      cars,
    );
    expect(r.groups).toHaveLength(1);
  });

  it("liste les VIN inconnus de TeslaMate", () => {
    const r = compareCharges(
      [{ ...tesla("2026-07-20T10:00:00", "2026-07-20T11:00:00", 5), vin: "OTHER" }],
      [],
      cars,
    );
    expect(r.unknownVins).toEqual(["OTHER"]);
    expect(r.groups).toHaveLength(0);
  });

  it("signale un décalage de dates au-delà de 15 min", () => {
    const r = compareCharges(
      [tesla("2026-07-20T10:00:00", "2026-07-20T12:00:00", 5)],
      [tm(1, "2026-07-20T10:05:00", "2026-07-20T11:30:00", 5)],
      cars,
    );
    expect(r.groups[0]).toMatchObject({ kind: "ok", dateShiftMin: 30 });
  });
});

describe("privacy/merge — mergeImport", () => {
  it("cumule les imports en dédoublonnant sur (VIN, début)", () => {
    const a = tesla("2026-07-20T10:00:00", "2026-07-20T11:00:00", 5);
    const b = tesla("2026-07-21T10:00:00", "2026-07-21T11:00:00", 6);
    const first = mergeImport(EMPTY_STORE, [a], "a.csv", new Date("2026-10-01T00:00:00Z"));
    const second = mergeImport(first.store, [a, b], "b.csv", new Date("2026-10-02T00:00:00Z"));
    expect(second.store.sessions).toHaveLength(2);
    expect(second.entry).toMatchObject({ sessions: 2, added: 1, fileName: "b.csv" });
    expect(second.store.imports).toHaveLength(2);
  });
});
