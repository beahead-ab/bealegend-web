import { describe, expect, it } from "vitest";
import {
  dayStateLabel,
  isViewedDay,
  loadShare,
  planDate,
  sessionCount,
  weekPeriod,
  weekStateLabel,
  weekVolume,
  weekdayLabel,
  type PlanDay,
  type PlanWeek,
  type TrainingPlan,
} from "./plan";

const week = (over: Partial<PlanWeek> = {}): PlanWeek => ({
  week: 1,
  state: "current",
  deload: false,
  period_name: null,
  period_role: null,
  starts_on: "2026-08-24",
  sessions_planned: 3,
  sessions_completed: 0,
  load_kg: null,
  planned_load_kg: null,
  description: null,
  days: [],
  ...over,
});

describe("weekStateLabel", () => {
  it("namnger de fyra lägena", () => {
    expect(weekStateLabel("completed")).toBe("Gjort");
    expect(weekStateLabel("missed")).toBe("Missat");
    expect(weekStateLabel("current")).toBe("Nu");
    expect(weekStateLabel("upcoming")).toBe("Kommer");
  });

  it("lämnar ett okänt läge orört i stället för att tysta det", () => {
    // Ett läge servern lagt till är fortfarande sant. Att rita ingenting
    // hade tappat det.
    expect(weekStateLabel("paused")).toBe("paused");
  });
});

describe("dayStateLabel", () => {
  it("namnger de sex lägena, inklusive vilan", () => {
    expect(dayStateLabel("planned")).toBe("Planerat");
    expect(dayStateLabel("completed")).toBe("Gjort");
    expect(dayStateLabel("skipped")).toBe("Hoppat över");
    expect(dayStateLabel("extra")).toBe("Extra");
    expect(dayStateLabel("recovery")).toBe("Återhämtning");
    // Vila är frånvaro (#109) — ordet kommer från servern, inte ur en tom lista.
    expect(dayStateLabel("rest")).toBe("Vila");
  });
});

describe("sessionCount", () => {
  it("räknar gjorda mot begärda", () => {
    expect(sessionCount(week({ sessions_completed: 2, sessions_planned: 3 }))).toBe("2 av 3 pass");
  });

  it("slutar räkna när allt är gjort", () => {
    // "3 av 3" ber ögat jämföra två lika tal. Veckan är klar; säg det.
    expect(sessionCount(week({ sessions_completed: 3, sessions_planned: 3 }))).toBe("3 pass");
    expect(sessionCount(week({ sessions_completed: 4, sessions_planned: 3 }))).toBe("3 pass");
  });

  it("säger ingenting om en vecka utan begärda pass", () => {
    expect(sessionCount(week({ sessions_planned: 0 }))).toBeNull();
  });
});

/**
 * Talen skrivs med `\u00a0` — hårt blanksteg.
 *
 * `toLocaleString("sv-SE")` sätter det som tusentalsavskiljare, och ett vanligt
 * blanksteg här hade fått provet att falla mot en sträng som ser identisk ut i
 * felutskriften. Skrivet som escape-sekvens med flit: den syns i koden, till
 * skillnad från tecknet självt.
 */
describe("weekVolume", () => {
  it("skriver lyft mot planerat", () => {
    expect(weekVolume(week({ load_kg: 1200, planned_load_kg: 1500 })))
      .toBe("1\u00a0200 av 1\u00a0500 kg");
  });

  it("skriver bara det lyfta när målet inte går att räkna", () => {
    // Ett program utan belastningsregler har inget mål, och ett påhittat hade
    // varit ett tal ingen kan stå för.
    expect(weekVolume(week({ load_kg: 1200, planned_load_kg: null }))).toBe("1\u00a0200 kg");
  });

  it("skriver bara målet innan veckan börjat", () => {
    expect(weekVolume(week({ load_kg: null, planned_load_kg: 1500 }))).toBe("1\u00a0500 kg planerat");
  });

  it("skiljer noll från saknat", () => {
    // En vecka löpning har inga kilon. "0 av 1 500" hade påstått ett
    // misslyckande med något användaren aldrig ombads göra.
    expect(weekVolume(week({ load_kg: null, planned_load_kg: null }))).toBeNull();
    expect(weekVolume(week({ load_kg: 0, planned_load_kg: 1500 }))).toBe("0 av 1\u00a0500 kg");
  });
});

describe("loadShare", () => {
  it("räknar andelen av veckans mål", () => {
    expect(loadShare(week({ load_kg: 750, planned_load_kg: 1500 }))).toBe(0.5);
  });

  it("klipper vid ett i stället för att rita utanför stapeln", () => {
    expect(loadShare(week({ load_kg: 3000, planned_load_kg: 1500 }))).toBe(1);
  });

  it("ger null när andelen inte går att veta", () => {
    expect(loadShare(week({ load_kg: 750, planned_load_kg: null }))).toBeNull();
    expect(loadShare(week({ load_kg: null, planned_load_kg: 1500 }))).toBeNull();
    // Ett mål på noll går inte att dela med, och andelen vore meningslös.
    expect(loadShare(week({ load_kg: 750, planned_load_kg: 0 }))).toBeNull();
  });
});

describe("weekPeriod", () => {
  it("låter coachens namn vinna över rollen", () => {
    expect(weekPeriod(week({ period_name: "Bas", period_role: "grund" }))).toBe("Bas");
  });

  it("faller tillbaka på rollens namn", () => {
    expect(weekPeriod(week({ period_name: "", period_role: "avlastning" }))).toBe("Avlastning");
    expect(weekPeriod(week({ period_name: null, period_role: "topp" }))).toBe("Topp");
  });

  it("säger ingenting när perioden varken har namn eller roll", () => {
    expect(weekPeriod(week())).toBeNull();
  });

  it("lämnar en okänd roll orörd", () => {
    expect(weekPeriod(week({ period_role: "tapering" }))).toBe("tapering");
  });
});

describe("weekdayLabel", () => {
  it("läser dagen ur strängen, inte ur en UTC-tolkning", () => {
    // new Date("2026-08-24") är midnatt UTC — alltså söndagen för alla väster
    // om den. Delarna byggs ihop för hand av samma skäl som i route.ts.
    expect(weekdayLabel("2026-08-24")).toBe("mån");
    expect(weekdayLabel("2026-08-30")).toBe("sön");
  });
});

describe("isViewedDay", () => {
  const plan = { viewed_date: "2026-08-26" } as TrainingPlan;
  const day = (date: string): PlanDay => ({ date, state: "planned", sessions: [] });

  it("jämför strängar och inte Date-objekt", () => {
    expect(isViewedDay(day("2026-08-26"), plan)).toBe(true);
    expect(isViewedDay(day("2026-08-27"), plan)).toBe(false);
  });
});

describe("planDate", () => {
  /**
   * Vägen ur planen in i ett pass går genom dagen, så en dag fel öppnar fel
   * pass. new Date("2026-08-24") är midnatt UTC — alltså den 23:e för alla
   * väster om den.
   */
  it("bygger dagen av delarna, inte ur en UTC-tolkning", () => {
    const date = planDate("2026-08-24");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(24);
  });
});
