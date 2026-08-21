import { describe, expect, it } from "vitest";
import { headingFor } from "./TodayView";

const TODAY = new Date(2026, 7, 21);

describe("headingFor", () => {
  /** The heading kept one voice only for today; every other day it repeated
   *  the weekday the kicker already said. */
  it("keeps the voice on every day", () => {
    expect(headingFor(TODAY, TODAY)).toBe("Idag.");
    expect(headingFor(new Date(2026, 7, 20), TODAY)).toBe("Igår.");
    expect(headingFor(new Date(2026, 7, 22), TODAY)).toBe("I morgon.");
  });

  it("names the day itself further out, and never the weekday twice", () => {
    const heading = headingFor(new Date(2026, 7, 17), TODAY);

    expect(heading).toBe("17 augusti.");
    expect(heading).not.toContain("måndag");
  });
});
