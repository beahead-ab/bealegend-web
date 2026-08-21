import { describe, expect, it } from "vitest";
import { isoDate } from "./daily";
import { coveringRange, rangeFor, rangeLabel, withinRange } from "./history";

const AUGUST_21 = new Date(2026, 7, 21);

describe("rangeFor", () => {
  it("counts a scope back from the day on screen, inclusive", () => {
    const range = rangeFor("last7Days", AUGUST_21);

    expect(isoDate(range.from)).toBe("2026-08-15");
    expect(isoDate(range.to)).toBe("2026-08-21");
  });

  it("moves with the day the surface is showing", () => {
    expect(isoDate(rangeFor("last7Days", new Date(2026, 7, 14)).from)).toBe("2026-08-08");
  });

  it("starts this week on Monday, not on Sunday", () => {
    expect(rangeFor("thisWeek", AUGUST_21).from.getDay()).toBe(1);
  });

  it("keeps a Monday's own week to that one day", () => {
    const monday = new Date(2026, 7, 17);

    expect(isoDate(rangeFor("thisWeek", monday).from)).toBe("2026-08-17");
  });

  /** The web has no goal-start date, so it draws the longest window it can ask
   *  for — and says so, rather than implying a starting point it never had. */
  it("substitutes a stated window for a goal start it cannot know", () => {
    expect(isoDate(rangeFor("sinceGoalStart", AUGUST_21).from)).toBe("2026-05-24");
    expect(rangeLabel("sinceGoalStart")).toBe("90 dagar");
  });

  it("falls back rather than producing an empty window for a word it does not know", () => {
    expect(isoDate(rangeFor("nästaÅr", AUGUST_21).from)).toBe("2026-08-15");
  });
});

describe("coveringRange", () => {
  /** Three window words on one surface still cost one request. */
  it("reaches back as far as the widest scope asked for", () => {
    const range = coveringRange(["last7Days", "last30Days", "thisWeek"], AUGUST_21);

    expect(isoDate(range!.from)).toBe("2026-07-23");
    expect(isoDate(range!.to)).toBe("2026-08-21");
  });

  it("asks for nothing when no word needs a window", () => {
    expect(coveringRange([], AUGUST_21)).toBeNull();
  });
});

describe("withinRange", () => {
  it("includes both ends", () => {
    const range = rangeFor("last7Days", AUGUST_21);

    expect(withinRange("2026-08-15", range)).toBe(true);
    expect(withinRange("2026-08-21", range)).toBe(true);
    expect(withinRange("2026-08-14", range)).toBe(false);
    expect(withinRange("2026-08-22", range)).toBe(false);
  });
});
