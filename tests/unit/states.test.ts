import { describe, expect, it, vi, beforeEach } from "vitest";
import { closePreviousOpenState } from "@/lib/integrity/states";

/**
 * `closePreviousOpenState` reçoit son client Prisma en paramètre, donc pas
 * besoin de `vi.mock("@/lib/db")`. On lui passe un faux `tx` typé loosement.
 */
type FakeTx = {
  states: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): FakeTx {
  return {
    states: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
}

let tx: FakeTx;

beforeEach(() => {
  tx = makeTx();
});

describe("integrity/states — closePreviousOpenState", () => {
  it("retourne closedId=null s'il n'y a pas d'état ouvert", async () => {
    tx.states.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await closePreviousOpenState(1, new Date("2024-01-01T10:00:00Z"), tx as any);
    expect(res.closedId).toBeNull();
    expect(tx.states.update).not.toHaveBeenCalled();
  });

  it("ferme l'état précédent à start - 1s quand le précédent commence avant", async () => {
    const prevStart = new Date("2024-01-01T08:00:00Z");
    tx.states.findFirst.mockResolvedValue({ id: 7, start_date: prevStart });
    tx.states.update.mockResolvedValue({});

    const newStart = new Date("2024-01-01T10:00:00Z");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await closePreviousOpenState(1, newStart, tx as any);

    expect(res.closedId).toBe(7);
    expect(tx.states.update).toHaveBeenCalledTimes(1);
    const call = tx.states.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 7 });
    // end_date doit être newStart - 1000ms
    expect(call.data.end_date.getTime()).toBe(newStart.getTime() - 1000);
  });

  it("clamp end_date à start_date du précédent quand le nouveau start est avant ou trop proche", async () => {
    const prevStart = new Date("2024-01-01T10:00:00Z");
    tx.states.findFirst.mockResolvedValue({ id: 9, start_date: prevStart });
    tx.states.update.mockResolvedValue({});

    // Nouveau start = prevStart -> closeAt = prevStart - 1s, donc avant.
    // L'implémentation clamp à prevStart pour respecter le CHECK end >= start.
    const newStart = new Date("2024-01-01T10:00:00Z");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await closePreviousOpenState(1, newStart, tx as any);

    expect(res.closedId).toBe(9);
    const call = tx.states.update.mock.calls[0][0];
    expect(call.data.end_date.getTime()).toBe(prevStart.getTime());
  });

  it("ne touche que le car_id demandé (filtre find correct)", async () => {
    tx.states.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await closePreviousOpenState(42, new Date(), tx as any);
    const findArgs = tx.states.findFirst.mock.calls[0][0];
    expect(findArgs.where).toEqual({ car_id: 42, end_date: null });
  });
});
