import { request } from "./api";

/** `daily-overview.v1`, only the fields this client draws. */
export type DailyOverview = {
  date: string;
  headline: string | null;
  user: { first_name: string | null };
  calories: {
    can_calculate: boolean;
    goal: number;
    consumed: number;
    remaining: number;
    is_over: boolean;
  };
  health: {
    steps: number;
    step_goal: number;
    active_calories: number;
    /** Null, never zero: a night nobody measured is not a night without sleep. */
    sleep_minutes?: number | null;
    sleep_goal_min_minutes?: number | null;
    sleep_goal_max_minutes?: number | null;
  };
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    protein_goal: number | null;
    carbs_goal: number | null;
    fat_goal: number | null;
  };
  meals: Meal[];
};

export type Meal = {
  id: string;
  description: string | null;
  calories: number;
  logged_at: string;
};

export function isoDate(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function fetchOverview(date: Date): Promise<DailyOverview> {
  return request<DailyOverview>("/api/v1/daily-overview", {
    method: "POST",
    body: JSON.stringify({
      date: isoDate(date),
      // The server requires it, and the browser is the only party that knows
      // which midnight the user means.
      time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
}

export function swedishNumber(value: number): string {
  return value.toLocaleString("sv-SE");
}

/**
 * The rule-based sentence, for every account with nothing distilled yet —
 * which is every account on its first day. Says only what can be read straight
 * off the day, and says "Idag." rather than inventing a number it does not have.
 */
export function ruleBasedSentence(overview: DailyOverview, showsTraining: boolean): string {
  const clauses: string[] = [];
  const calories = overview.calories;

  if (calories.can_calculate && calories.goal > 0) {
    clauses.push(
      calories.is_over
        ? `Du ligger ${swedishNumber(Math.abs(calories.remaining))} kcal över`
        : `Du har ${swedishNumber(calories.remaining)} kcal kvar`,
    );
  }
  if (showsTraining) {
    clauses.push(clauses.length === 0 ? "Dagens pass väntar" : "dagens pass väntar");
  }
  if (clauses.length === 0) return "Idag.";
  return `${clauses.join(" och ")}.`;
}

/**
 * The day that may be drawn under a given date, or null.
 *
 * Every path that loads a day already clears the old one first, and this is
 * what holds if one ever stops: a stored answer filed under the wrong key, a
 * response that lands after the reader has paged on. The heading says which
 * date this is, and nothing below it may describe another one.
 */
export function dayOnScreen(overview: DailyOverview | null, iso: string): DailyOverview | null {
  return overview && overview.date === iso ? overview : null;
}

/**
 * Whether the day holds a single measurement.
 *
 * Not "is this a new account" — the surface cannot know that, and does not need
 * to. A day with nothing on it reads the same whether it is somebody's first or
 * a Tuesday they have not touched yet, and the ways in are the same in both.
 */
export function nothingMeasured(overview: DailyOverview): boolean {
  const macros = overview.macros;
  const health = overview.health;
  return (overview.meals?.length ?? 0) === 0
    && macros.protein + macros.carbs + macros.fat === 0
    && health.steps === 0
    && health.active_calories === 0
    && (health.sleep_minutes ?? 0) === 0;
}

/** The coach's sentence when it wrote one, the rule's when it did not. */
export function heroSentence(overview: DailyOverview, showsTraining: boolean): string {
  const headline = overview.headline?.trim();
  return headline ? headline : ruleBasedSentence(overview, showsTraining);
}
