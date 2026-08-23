import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { isStaleUndo, undoable, whenLabel, type DashboardChange } from "./changes";

function change(over: Partial<DashboardChange> = {}): DashboardChange {
  return {
    revision: 4,
    action: "add",
    binding: "health.weight",
    summary: "Vikttrend ligger på startsidan nu.",
    origin: "user",
    undone: false,
    changed_at: "2026-08-23T09:00:00Z",
    ...over,
  };
}

describe("undoable", () => {
  it("erbjuder Ångra på den nyaste raden", () => {
    expect(undoable([change()])?.revision).toBe(4);
  });

  /** Servern ångrar alltid den senaste revisionen. En knapp bredvid en äldre
   *  rad hade tagit tillbaka något annat än det man pekade på. */
  it("erbjuder aldrig Ångra på en äldre rad", () => {
    const trail = [change({ revision: 9 }), change({ revision: 4 })];
    expect(undoable(trail)?.revision).toBe(9);
  });

  /** Ett ångrat ångrande vore ett gör-om, och ordet lovar inte det. */
  it("går inte att ångra ett ångrande", () => {
    expect(undoable([change({ action: "undo" })])).toBeNull();
  });

  it("går inte att ångra en rad som redan är ångrad", () => {
    expect(undoable([change({ undone: true })])).toBeNull();
  });

  it("en startsida ingen rört har ingenting att ångra", () => {
    expect(undoable([])).toBeNull();
  });
});

describe("isStaleUndo", () => {
  it("känner igen 409", () => {
    expect(isStaleUndo(new ApiError(409, "", "stale_undo"))).toBe(true);
  });

  /** Ett annat fel ska inte läsas som "läs om" — då hade ytan svarat lugnt på
   *  något som faktiskt gått sönder. */
  it("läser inte andra fel som inaktuella", () => {
    expect(isStaleUndo(new ApiError(500, ""))).toBe(false);
    expect(isStaleUndo(new Error("nätet"))).toBe(false);
  });
});

describe("whenLabel", () => {
  const now = Date.parse("2026-08-23T12:00:00Z");

  it("säger nyss under en minut", () => {
    expect(whenLabel("2026-08-23T11:59:30Z", now)).toBe("nyss");
  });

  it("räknar minuter och timmar", () => {
    expect(whenLabel("2026-08-23T11:20:00Z", now)).toBe("för 40 min sedan");
    expect(whenLabel("2026-08-23T09:00:00Z", now)).toBe("för 3 h sedan");
  });

  /** Ett dygn, inte ett datumbyte: "i går" om något som hände för nio timmar
   *  sedan är fel oftare än det är rätt. */
  it("byter till dagar först efter ett dygn", () => {
    expect(whenLabel("2026-08-22T13:00:00Z", now)).toBe("för 23 h sedan");
    expect(whenLabel("2026-08-22T11:00:00Z", now)).toBe("i går");
    expect(whenLabel("2026-08-20T11:00:00Z", now)).toBe("för 3 dagar sedan");
  });

  it("en oläslig tidpunkt ger tomt i stället för NaN", () => {
    expect(whenLabel("inte ett datum", now)).toBe("");
  });
});
