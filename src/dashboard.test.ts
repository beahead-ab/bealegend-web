import { describe, expect, it } from "vitest";
import { canRender, sections, windowScopes, WORDS, type DashboardWidget } from "./dashboard";
import type { DailyOverview } from "./daily";
import { rangeFor, type HistoryWindow } from "./history";

const widget = (binding: string, presentation = "metricRow", scope = "today"): DashboardWidget => ({
  binding,
  scope,
  presentation,
  size: "small",
});

/**
 * Ported from the iOS client's DashboardSectionTests, case for case. The
 * configuration decides both what is shown and in what order, and grouping has
 * to honour the order rather than tidy it.
 */
describe("sections", () => {
  it("puts consecutive widgets of one group in one card", () => {
    const result = sections([
      widget("daily.energyBudget"),
      widget("daily.protein"),
      widget("training.todaySession"),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].group).toBe("Näring");
    expect(result[0].widgets).toHaveLength(2);
    expect(result[1].group).toBe("Träning");
  });

  it("lets order decide which card comes first", () => {
    const result = sections([widget("training.todaySession"), widget("daily.energyBudget")]);

    expect(result[0].group).toBe("Träning");
  });

  /** Merging these would quietly reorder the surface the user asked for. */
  it("keeps a group split when another interrupts it", () => {
    const result = sections([
      widget("daily.protein"),
      widget("training.todaySession"),
      widget("daily.energyBudget"),
    ]);

    expect(result.map((section) => section.group)).toEqual(["Näring", "Träning", "Näring"]);
  });

  it("skips a binding this build does not know", () => {
    const result = sections([widget("daily.protein"), widget("future.somethingElse")]);

    expect(result).toHaveLength(1);
    expect(result[0].widgets.map((w) => w.binding)).toEqual(["daily.protein"]);
  });

  it("skips a form this build cannot draw", () => {
    expect(sections([widget("daily.protein", "sparkline")])).toHaveLength(0);
  });

  /** The one place a binding's name and its home disagree. */
  it("puts steps under Hälsa despite the daily prefix", () => {
    expect(sections([widget("daily.steps")])[0].group).toBe("Hälsa");
  });
});

describe("canRender", () => {
  it("draws the three richer forms now that the client knows them", () => {
    expect(canRender(widget("daily.protein", "ring"))).toBe(true);
    expect(canRender(widget("health.weight", "lineChart", "last7Days"))).toBe(true);
    expect(canRender(widget("daily.meals", "list"))).toBe(true);
  });

  /**
   * The client's half of the shape rule. The server will not write this pairing,
   * but a configuration older than the word, or a word the server later
   * reshapes, would arrive as a row with nothing to put in it.
   */
  it("declines a word paired with a form it cannot fill", () => {
    expect(canRender(widget("daily.meals", "metricRow"))).toBe(false);
    expect(canRender(widget("health.weight", "ring", "last7Days"))).toBe(false);
    expect(canRender(widget("daily.protein", "lineChart"))).toBe(false);
  });

  it("declines a word it has never heard of, in any form", () => {
    expect(canRender(widget("future.somethingElse", "list"))).toBe(false);
  });
});

describe("windowScopes", () => {
  it("names only the words that read a window", () => {
    expect(windowScopes([
      widget("daily.protein", "ring"),
      widget("health.weight", "lineChart", "last30Days"),
      widget("training.recentSessions", "list", "thisWeek"),
    ])).toEqual(["last30Days", "thisWeek"]);
  });

  /** A surface of day words must not pay for a history request. */
  it("asks for nothing when the surface reads only today", () => {
    expect(windowScopes([widget("daily.protein"), widget("daily.meals", "list")])).toEqual([]);
  });

  it("ignores a window word it cannot draw anyway", () => {
    expect(windowScopes([widget("health.weight", "metricRow", "last7Days")])).toEqual([]);
  });
});

const overview = (meals: DailyOverview["meals"] = []): DailyOverview => ({
  date: "2026-08-21",
  headline: null,
  user: { first_name: "Casper" },
  calories: { can_calculate: true, goal: 2400, consumed: 1160, remaining: 1240, is_over: false },
  health: { steps: 4051, step_goal: 7000, active_calories: 445 },
  macros: { protein: 82, carbs: 55, fat: 20, protein_goal: 165, carbs_goal: null, fat_goal: null },
  meals,
});

describe("health.weight", () => {
  const window = (days: HistoryWindow["days"]): HistoryWindow => ({ days, training_runs: [] });
  const range = rangeFor("last7Days", new Date(2026, 7, 21));

  it("charts the days that were weighed, oldest first", () => {
    const series = WORDS["health.weight"].series!(
      window([
        { date: "2026-08-19", weight_kg: 84.1 },
        { date: "2026-08-16", weight_kg: 85.0 },
      ]),
      range,
    );

    expect(series.map((point) => point.date)).toEqual(["2026-08-16", "2026-08-19"]);
    expect(series.map((point) => point.value)).toEqual([85.0, 84.1]);
  });

  /** A day nobody stepped on the scale is a gap, not a zero — drawing it would
   *  put a cliff in the chart where there was only a missed morning. */
  it("leaves out the days with no weight rather than reading them as nought", () => {
    const series = WORDS["health.weight"].series!(
      window([
        { date: "2026-08-16", weight_kg: 85.0 },
        { date: "2026-08-17", weight_kg: null },
        { date: "2026-08-18", weight_kg: 84.6 },
      ]),
      range,
    );

    expect(series).toHaveLength(2);
  });

  /** One request covers the widest scope, so a narrower widget has to cut its
   *  own window out of it. */
  it("keeps to its own scope inside a wider fetch", () => {
    const series = WORDS["health.weight"].series!(
      window([
        { date: "2026-07-30", weight_kg: 86.2 },
        { date: "2026-08-18", weight_kg: 84.6 },
      ]),
      range,
    );

    expect(series.map((point) => point.date)).toEqual(["2026-08-18"]);
  });
});

describe("daily.meals", () => {
  it("lists the day in the order it was eaten", () => {
    const items = WORDS["daily.meals"].items!(
      overview([
        { id: "b", description: "Lunch", calories: 640, logged_at: "2026-08-21T11:20:00Z" },
        { id: "a", description: "Frukost", calories: 410, logged_at: "2026-08-21T06:05:00Z" },
      ]),
      null,
      rangeFor("last7Days", new Date(2026, 7, 21)),
    );

    expect(items.map((item) => item.label)).toEqual(["Frukost", "Lunch"]);
    expect(items[0].detail).toBe("410 kcal");
  });

  it("names a meal that was logged without one", () => {
    const items = WORDS["daily.meals"].items!(
      overview([{ id: "a", description: "  ", calories: 210, logged_at: "2026-08-21T06:05:00Z" }]),
      null,
      rangeFor("last7Days", new Date(2026, 7, 21)),
    );

    expect(items[0].label).toBe("Måltid");
  });
});

describe("training.recentSessions", () => {
  const run = (id: string, completedAt: string, title = "Överkropp") => ({
    id,
    title,
    session_type: "strength",
    completed_at: completedAt,
    active_seconds: 2700,
  });

  it("puts the most recent pass at the top", () => {
    const items = WORDS["training.recentSessions"].items!(
      overview(),
      { days: [], training_runs: [run("a", "2026-08-17T16:00:00Z"), run("b", "2026-08-20T16:00:00Z")] },
      rangeFor("last7Days", new Date(2026, 7, 21)),
    );

    expect(items.map((item) => item.id)).toEqual(["b", "a"]);
    expect(items[0].detail).toContain("45 min");
  });

  it("draws nothing at all without a window to read", () => {
    expect(WORDS["training.recentSessions"].items!(overview(), null, rangeFor("last7Days", new Date(2026, 7, 21))))
      .toEqual([]);
  });
});
