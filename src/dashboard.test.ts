import { describe, expect, it } from "vitest";
import {
  WORDS,
  canRender,
  hiddenCount,
  mergeNutrition,
  resourceWidgets,
  sections,
  type DashboardList,
  type DashboardSeries,
  type DashboardWidget,
  visibleWidgets,
  windowScopes,
} from "./dashboard";
import type { DailyOverview } from "./daily";

/** Bara det sömnorden läser — resten vore brus i ett test om sömn. */
function overviewWith(health: Partial<DailyOverview["health"]>): DailyOverview {
  return {
    date: "2026-08-22",
    headline: null,
    user: { first_name: null },
    calories: { can_calculate: true, goal: 2400, consumed: 0, remaining: 2400, is_over: false },
    health: { steps: 0, step_goal: 7000, active_calories: 0, ...health },
    macros: { protein: 0, carbs: 0, fat: 0, protein_goal: null, carbs_goal: null, fat_goal: null },
    meals: [],
  };
}
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

describe("resourceWidgets", () => {
  it("asks the server once for each configured series or list", () => {
    expect(resourceWidgets([
      widget("health.weight", "lineChart", "last12Weeks"),
      widget("health.weight", "lineChart", "last12Weeks"),
      widget("training.recentSessions", "list", "last7Days"),
      widget("daily.protein", "ring"),
    ]).map(({ binding, scope }) => `${binding}|${scope}`)).toEqual([
      "health.weight|last12Weeks",
      "training.recentSessions|last7Days",
    ]);
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
  const seriesResponse = (points: DashboardSeries["points"]): DashboardSeries => ({
    schema_version: "dashboard-series.v1",
    binding: "health.weight",
    scope: "last12Weeks",
    unit: "kg",
    from: "2026-06-01",
    to: "2026-08-21",
    points,
  });

  it("charts the days that were weighed, oldest first", () => {
    const series = WORDS["health.weight"].series!(
      seriesResponse([
        { date: "2026-08-16", value: 85.0 },
        { date: "2026-08-19", value: 84.1 },
      ]),
    );

    expect(series.map((point) => point.date)).toEqual(["2026-08-16", "2026-08-19"]);
    expect(series.map((point) => point.value)).toEqual([85.0, 84.1]);
  });

  it("renders the server-owned points without recalculating its scope", () => {
    const response = seriesResponse([{ date: "2026-08-18", value: 84.6 }]);
    const series = WORDS["health.weight"].series!(response);

    expect(series).toBe(response.points);
  });
});

describe("health.restingHeartRate", () => {
  /** Same treatment as weight, and for the same reasons: a series over the
   *  window, gaps left as gaps, sorted oldest first. The word arrived with the
   *  design target; the data has been in the history contract all along. */
  it("charts the mornings that measured, oldest first", () => {
    const series = WORDS["health.restingHeartRate"].series!({
      schema_version: "dashboard-series.v1",
      binding: "health.restingHeartRate",
      scope: "last12Weeks",
      unit: "slag/min",
      from: "2026-06-01",
      to: "2026-08-21",
      points: [{ date: "2026-08-16", value: 54 }, { date: "2026-08-19", value: 52 }],
    });

    expect(series.map((point) => point.value)).toEqual([54, 52]);
  });
});

describe("daily.meals", () => {
  it("lists the day in the order it was eaten", () => {
    const items = WORDS["daily.meals"].items!(
      overview([
        { id: "b", description: "Lunch", calories: 640, logged_at: "2026-08-21T11:20:00Z" },
        { id: "a", description: "Frukost", calories: 410, logged_at: "2026-08-21T06:05:00Z" },
      ]),
      undefined,
    );

    expect(items.map((item) => item.label)).toEqual(["Frukost", "Lunch"]);
    expect(items[0].detail).toBe("410 kcal");
  });

  it("names a meal that was logged without one", () => {
    const items = WORDS["daily.meals"].items!(
      overview([{ id: "a", description: "  ", calories: 210, logged_at: "2026-08-21T06:05:00Z" }]),
      undefined,
    );

    expect(items[0].label).toBe("Måltid");
  });
});

describe("training.recentSessions", () => {
  it("puts the most recent pass at the top", () => {
    const resource: DashboardList = {
      schema_version: "dashboard-list.v1",
      binding: "training.recentSessions",
      scope: "last7Days",
      from: "2026-08-15",
      to: "2026-08-21",
      items: [
        { date: "2026-08-20", title: "Överkropp", status: "completed", detail: "45 min" },
        { date: "2026-08-17", title: "Underkropp", status: "completed", detail: "52 min" },
      ],
    };
    const items = WORDS["training.recentSessions"].items!(
      overview(),
      resource,
    );

    expect(items.map((item) => item.label)).toEqual(["Överkropp", "Underkropp"]);
    expect(items[0].detail).toContain("45 min");
  });

  it("draws nothing at all without the server list", () => {
    expect(WORDS["training.recentSessions"].items!(overview(), undefined))
      .toEqual([]);
  });
});

describe("de målriktade formerna", () => {
  it("ritar sömnen som intervall och nedräkningen som nedräkning", () => {
    expect(canRender(widget("daily.sleep", "rangeBar"))).toBe(true);
    expect(canRender(widget("goal.countdown", "countdown"))).toBe(true);
  });

  it("vägrar former orden inte har", () => {
    expect(canRender(widget("daily.sleep", "lineChart"))).toBe(false);
    expect(canRender(widget("daily.protein", "rangeBar"))).toBe(false);
    expect(canRender(widget("goal.countdown", "metricRow"))).toBe(false);
  });

  it("läser sömnen mot användarens eget fönster", () => {
    const reading = WORDS["daily.sleep"].range!(overviewWith({
      sleep_minutes: 450,
      sleep_goal_min_minutes: 420,
      sleep_goal_max_minutes: 510,
    }));

    expect(reading?.text).toBe("7 h 30 min");
    expect(reading?.band).toBe("i ditt fönster");
  });

  it("säger under fönstret utan att döma", () => {
    const reading = WORDS["daily.sleep"].range!(overviewWith({
      sleep_minutes: 330,
      sleep_goal_min_minutes: 420,
      sleep_goal_max_minutes: 510,
    }));

    expect(reading?.band).toBe("under ditt fönster");
  });

  /** Utan mål ritas ingen zon — och ingen zon påstås heller. */
  it("utan sömnmål finns varken zon eller påstående", () => {
    const reading = WORDS["daily.sleep"].range!(overviewWith({ sleep_minutes: 400 }));

    expect(reading?.min).toBeNull();
    expect(reading?.max).toBeNull();
    expect(reading?.band).toBeNull();
  });

  /** En natt ingen mätt är inte en natt utan sömn. */
  it("en omätt natt visas som omätt, inte som noll", () => {
    const reading = WORDS["daily.sleep"].range!(overviewWith({}));

    expect(reading?.value).toBeNull();
    expect(reading?.text).toBe("Inget mätt i natt");
  });
});

describe("nya serverägda dagsvärden", () => {
  it("ritar vätska som golv utan att hitta på ett standardmål", () => {
    const word = WORDS["daily.water"];
    const base = overviewWith({});

    expect(word.value?.({ ...base, hydration: { consumed_ml: 1_750, goal_ml: 2_500 } }))
      .toBe("1,8 av minst 2,5 l");
    expect(word.value?.({ ...base, hydration: { consumed_ml: 750, goal_ml: null } }))
      .toBe("0,8 l");
  });

  it("ritar veckobelastningen bara när servern har ett vägt värde", () => {
    const word = WORDS["training.weekLoad"];
    const base = overviewWith({});

    expect(word.value?.({
      ...base,
      training: { week_start: "2026-08-24", sessions_planned: 4, sessions_completed: 2, week_load_kg: 12_480 },
    })).toBe("12,5 ton");
    expect(word.value?.({
      ...base,
      training: { week_start: "2026-08-24", sessions_planned: 4, sessions_completed: 2, week_load_kg: null },
    })).toBeNull();
  });
});

/**
 * Tystnad och frånvaro ser likadana ut i en nolla, och bara ordet vet vilken
 * det tittar på. `measured` skiljer dem åt: falskt ritar den tomma formen,
 * medan `value` som svarar null betyder att ordet inte går att rita alls.
 */
describe("vad som räknas som mätt", () => {
  function withMacros(macros: Partial<DailyOverview["macros"]>, meals: DailyOverview["meals"] = []) {
    const base = overviewWith({});
    return { ...base, macros: { ...base.macros, ...macros }, meals };
  }

  it("kallar inte en dag utan mat för noll gram", () => {
    expect(WORDS["daily.protein"].measured?.(withMacros({ protein_goal: 150 }))).toBe(false);
    expect(WORDS["daily.carbs"].measured?.(withMacros({}))).toBe(false);
    expect(WORDS["daily.fat"].measured?.(withMacros({}))).toBe(false);
  });

  it("räknar ett loggat gram som mätt även utan måltid i listan", () => {
    expect(WORDS["daily.protein"].measured?.(withMacros({ protein: 32 }))).toBe(true);
  });

  it("räknar en loggad måltid som mätt", () => {
    const meal = { id: "m1", description: "Gröt", calories: 320, logged_at: "2026-08-22T06:40:00Z" };
    expect(WORDS["daily.protein"].measured?.(withMacros({}, [meal]))).toBe(true);
  });

  /** Webben har ingen egen sensor. Båda på exakt noll betyder att ingenting
   *  synkats, långt oftare än att någon legat still ett helt dygn. */
  it("kallar inte en osynkad dag för noll steg", () => {
    expect(WORDS["daily.steps"].measured?.(overviewWith({ steps: 0, active_calories: 0 }))).toBe(false);
    expect(WORDS["daily.activeEnergy"].measured?.(overviewWith({ steps: 0, active_calories: 0 }))).toBe(false);
  });

  it("räknar dagen som mätt så snart något av talen rört sig", () => {
    expect(WORDS["daily.steps"].measured?.(overviewWith({ steps: 12 }))).toBe(true);
    expect(WORDS["daily.steps"].measured?.(overviewWith({ active_calories: 40 }))).toBe(true);
  });

  it("läser veckans pass ur dagens serverkontrakt", () => {
    const word = WORDS["training.weekVolume"];
    const withoutProgram = overviewWith({});
    const withProgram = {
      ...withoutProgram,
      training: { week_start: "2026-08-24", sessions_planned: 4, sessions_completed: 2 },
    };

    expect(word.measured?.(withoutProgram)).toBe(false);
    expect(word.value?.(withProgram)).toBe("2 av minst 4");
  });

  it("låter ord utan omdöme räknas som mätta", () => {
    expect(WORDS["daily.energyBudget"].measured).toBe(undefined);
  });
});

describe("visibleWidgets", () => {
  const many = (count: number) =>
    ["daily.protein", "daily.carbs", "daily.fat", "daily.steps", "daily.activeEnergy",
     "daily.energyBudget", "daily.meals", "training.todaySession"]
      .slice(0, count)
      .map((binding) => widget(binding, binding === "daily.meals" ? "list" : "metricRow"));

  it("visar sex saker och lägger resten bakom ett ord", () => {
    expect(visibleWidgets(many(8), false)).toHaveLength(6);
    expect(hiddenCount(many(8))).toBe(2);
  });

  it("visar allt när användaren bett om det", () => {
    expect(visibleWidgets(many(8), true)).toHaveLength(8);
  });

  it("räknar bara det som faktiskt går att rita", () => {
    expect(hiddenCount([...many(6), widget("future.somethingElse", "list")])).toBe(0);
  });
});

describe("hero", () => {
  it("ett stort kort står för sig självt", () => {
    const result = sections([
      { ...widget("daily.protein", "metricRow"), size: "small" },
      { ...widget("daily.steps", "metricRow"), size: "large" },
      { ...widget("daily.activeEnergy", "metricRow"), size: "small" },
    ]);

    expect(result).toHaveLength(3);
    expect(result[1].hero).toBe(true);
    expect(result[0].hero).toBe(false);
  });
});

describe("mergeNutrition", () => {
  const widget = (binding: string, size = "small"): DashboardWidget => ({
    binding, scope: "today", presentation: "metricRow", size,
  });

  /**
   * Näringsmodulen ritar hela dagens näring, inte den widget som utlöste den.
   * Två näringssektioner gav därför två identiska moduler efter varandra —
   * med rubriken NÄRING två gånger.
   */
  it("slår ihop två näringssektioner till en", () => {
    // Precis det som händer när ett näringsord är stort: en hero står ensam,
    // och nästa näringsord hamnar i en egen sektion.
    const split = sections([widget("daily.energyBudget", "large"), widget("daily.protein")]);
    expect(split).toHaveLength(2);
    const merged = mergeNutrition(split);
    expect(merged).toHaveLength(1);
    expect(merged[0].widgets.map((w) => w.binding))
      .toEqual(["daily.energyBudget", "daily.protein"]);
  });

  it("behåller orden, så att vattnet inte tappas", () => {
    // bindings avgör om vattnet visas. Att slänga den andra sektionens ord
    // hade tagit bort vattnet för den som bett om det.
    const merged = mergeNutrition(sections([
      widget("daily.energyBudget", "large"),
      widget("daily.water"),
    ]));
    expect(merged[0].widgets.some((w) => w.binding === "daily.water")).toBe(true);
  });

  it("rör inte andra grupper", () => {
    const split = sections([widget("training.todaySession"), widget("daily.protein")]);
    expect(mergeNutrition(split).map((s) => s.group)).toEqual(split.map((s) => s.group));
  });

  it("håller näringen kvar där den första sektionen stod", () => {
    // Ordningen är användarens. Att flytta näringen först hade tyst gjort om
    // "lägg träningen överst".
    const merged = mergeNutrition(sections([
      widget("training.todaySession"),
      widget("daily.energyBudget", "large"),
      widget("daily.protein"),
    ]));
    expect(merged.map((s) => s.group)).toEqual(["Träning", "Näring"]);
  });

  it("lämnar den inkommande listan orörd", () => {
    const split = sections([widget("daily.energyBudget", "large"), widget("daily.protein")]);
    const before = split.map((s) => s.widgets.length);
    mergeNutrition(split);
    expect(split.map((s) => s.widgets.length)).toEqual(before);
  });
});
