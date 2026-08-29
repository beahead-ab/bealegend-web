import { describe, expect, it } from "vitest";
import { isoDate } from "./daily";
import { readRoute, routeSearch, sameRoute } from "./route";

const TODAY = new Date(2026, 7, 21);
const WEDNESDAY = new Date(2026, 7, 19);

describe("readRoute", () => {
  it("reads a day and a surface out of a link", () => {
    const route = readRoute("?d=2026-08-19&v=pass", TODAY);

    expect(isoDate(route.date)).toBe("2026-08-19");
    expect(route.surface).toBe("session");
  });

  it("lands on today's day view for a bare address", () => {
    const route = readRoute("", TODAY);

    expect(isoDate(route.date)).toBe("2026-08-21");
    expect(route.surface).toBe("today");
  });

  /**
   * `new Date("2026-08-19")` is midnight UTC, which is the day before for
   * anyone west of it. The date is built from parts instead.
   */
  it("reads the day as a local day", () => {
    expect(readRoute("?d=2026-08-19", TODAY).date.getDate()).toBe(19);
  });

  it("falls back rather than showing an invalid day", () => {
    expect(isoDate(readRoute("?d=igår", TODAY).date)).toBe("2026-08-21");
    expect(readRoute("?v=biblioteket", TODAY).surface).toBe("today");
  });

  /**
   * The Date constructor rolls over rather than refusing: month 13 day 45 is a
   * real date months away. A mistyped link has to land on today, not on next
   * February — so the parts are read back after construction.
   */
  it("refuses a date that only exists by rolling over", () => {
    expect(isoDate(readRoute("?d=2026-13-45", TODAY).date)).toBe("2026-08-21");
    expect(isoDate(readRoute("?d=2026-02-30", TODAY).date)).toBe("2026-08-21");
    expect(isoDate(readRoute("?d=2026-00-10", TODAY).date)).toBe("2026-08-21");
  });

  /** But a real leap day is a real day. */
  it("accepts the 29th of February when there is one", () => {
    expect(isoDate(readRoute("?d=2028-02-29", TODAY).date)).toBe("2028-02-29");
  });
});

describe("routeSearch", () => {
  /** The address people see most says nothing, because they are already there. */
  it("writes nothing for today's day view", () => {
    expect(routeSearch({ date: TODAY, surface: "today" }, TODAY)).toBe("");
  });

  it("writes only what differs from the default", () => {
    expect(routeSearch({ date: TODAY, surface: "session" }, TODAY)).toBe("?v=pass");
    expect(routeSearch({ date: WEDNESDAY, surface: "today" }, TODAY)).toBe("?d=2026-08-19");
  });

  it("writes both when both differ", () => {
    expect(routeSearch({ date: WEDNESDAY, surface: "thread" }, TODAY)).toBe("?d=2026-08-19&v=chatt");
  });

  /** The bug this replaces: a reload kept the surface and lost the day. */
  it("survives a round trip through the address bar", () => {
    const route = { date: WEDNESDAY, surface: "session" as const };
    const back = readRoute(routeSearch(route, TODAY), TODAY);

    expect(isoDate(back.date)).toBe("2026-08-19");
    expect(back.surface).toBe("session");
  });
});

describe("sameRoute", () => {
  /** Two Date objects for one day are never ===, and pushing a history entry
   *  for a move that changed nothing would break the back button. */
  it("compares the day rather than the object", () => {
    expect(sameRoute({ date: new Date(2026, 7, 19), surface: "today" }, { date: WEDNESDAY, surface: "today" }))
      .toBe(true);
    expect(sameRoute({ date: WEDNESDAY, surface: "today" }, { date: WEDNESDAY, surface: "thread" }))
      .toBe(false);
  });
});

describe("programytan i adressen", () => {
  /**
   * Fjärde ytan, samma form som de tre andra: svenskt ord i länken, eftersom
   * adresser klistras in i meddelanden mellan människor.
   */
  it("läses och skrivs som ?v=program", () => {
    expect(readRoute("?v=program", WEDNESDAY).surface).toBe("program");
    expect(routeSearch({ date: WEDNESDAY, surface: "program" }, WEDNESDAY)).toBe("?v=program");
  });

  it("bär dagen vidare när man kom från en annan dag", () => {
    expect(routeSearch({ date: new Date(2026, 7, 12), surface: "program" }, WEDNESDAY))
      .toBe("?d=2026-08-12&v=program");
  });
});

describe("planytan i adressen", () => {
  /** Femte ytan. Ordet i länken är svenskt, som de fyra andra. */
  it("läses och skrivs som ?v=planen", () => {
    expect(readRoute("?v=planen", WEDNESDAY).surface).toBe("plan");
    expect(routeSearch({ date: WEDNESDAY, surface: "plan" }, WEDNESDAY)).toBe("?v=planen");
  });
});
