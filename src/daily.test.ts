import { describe, expect, it } from "vitest";
import { heroSentence, isoDate, ruleBasedSentence, swedishNumber, type DailyOverview } from "./daily";

/**
 * Swedish thousand separators are non-breaking spaces, which is correct
 * typography and invisible in a diff — two strings that look identical in a
 * failure message differ by one code point. Assertions normalise; the one test
 * below pins the real character so the intent is not lost.
 */
const plain = (text: string) => text.replace(/\u00A0/g, " ");

const day = (over: Partial<DailyOverview["calories"]> = {}, headline: string | null = null): DailyOverview => ({
  date: "2026-08-21",
  headline,
  user: { first_name: "Casper" },
  calories: { can_calculate: true, goal: 2400, consumed: 1160, remaining: 1240, is_over: false, ...over },
  health: { steps: 4051, step_goal: 7000, active_calories: 445 },
  macros: { protein: 82, carbs: 55, fat: 20, protein_goal: 165, carbs_goal: null, fat_goal: null },
  meals: [],
});

describe("heroSentence", () => {
  /** The whole point of the coach writing it. */
  it("prefers the coach's sentence when there is one", () => {
    expect(heroSentence(day({}, "Du sov tungt i natt — håll kvällspasset kort."), true))
      .toBe("Du sov tungt i natt — håll kvällspasset kort.");
  });

  it("falls back for every account with nothing distilled", () => {
    expect(plain(heroSentence(day(), true))).toBe("Du har 1 240 kcal kvar och dagens pass väntar.");
  });

  /** An empty string from the server is not a sentence. */
  it("treats a blank headline as no headline", () => {
    expect(plain(heroSentence(day({}, "   "), false))).toBe("Du har 1 240 kcal kvar.");
  });
});

describe("ruleBasedSentence", () => {
  it("says over rather than a negative number", () => {
    expect(plain(ruleBasedSentence(day({ remaining: -320, is_over: true }), false)))
      .toBe("Du ligger 320 kcal över.");
  });

  /** Better to say almost nothing than to invent a figure. */
  it("says Idag when there is nothing it can honestly state", () => {
    expect(ruleBasedSentence(day({ can_calculate: false }), false)).toBe("Idag.");
  });

  it("promises the session alone when calories cannot be calculated", () => {
    expect(ruleBasedSentence(day({ can_calculate: false }), true)).toBe("Dagens pass väntar.");
  });
});

describe("swedishNumber", () => {
  it("separates thousands with a non-breaking space, not a plain one", () => {
    expect(swedishNumber(1240)).toBe("1\u00A0240");
  });
});

describe("isoDate", () => {
  /** toISOString would hand back yesterday for anyone east of UTC after 22:00. */
  it("keeps the local calendar day", () => {
    const lateEvening = new Date(2026, 7, 21, 23, 30);

    expect(isoDate(lateEvening)).toBe("2026-08-21");
  });
});
