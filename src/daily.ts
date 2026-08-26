import { request } from "./api";

/** `daily-overview.v1`, only the fields this client draws. */
export type DailyOverview = {
  date: string;
  headline: string | null;
  user: { first_name: string | null };
  calories: {
    can_calculate: boolean;
    goal: number;
    /** Optional until the daily overview contract exposes the interval. */
    goal_min?: number | null;
    goal_max?: number | null;
    consumed: number;
    consumed_min?: number | null;
    consumed_max?: number | null;
    remaining: number;
    is_over: boolean;
  };
  health: {
    steps: number;
    step_goal: number;
    active_calories: number;
    /**
     * När hälsodata senast nådde dagen. Null betyder att ingenting mätts —
     * inte att allt är noll.
     *
     * Frånvarande i svar från en server byggd före fältet, och i en dag som
     * legat i den lokala cachen sedan dess. Läs det aldrig som null utan att
     * skilja de två åt: `undefined` är »vet inte«, `null` är »vet, och svaret
     * är ingenting«.
     */
    measured_at?: string | null;
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
  training?: {
    week_start: string;
    sessions_planned: number;
    sessions_completed: number;
    week_load_kg?: number | null;
    today_session_title?: string | null;
    today_session_status?: string | null;
  } | null;
  hydration?: {
    consumed_ml: number;
    goal_ml?: number | null;
  } | null;
};

export type Meal = {
  id: string;
  description: string | null;
  calories: number;
  calories_min?: number | null;
  calories_max?: number | null;
  protein?: number;
  carbs?: number;
  fat?: number;
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
  return (overview.meals?.length ?? 0) === 0
    && macros.protein + macros.carbs + macros.fat === 0
    && !healthMeasured(overview);
}

/**
 * Om hälsodata nått den här dagen.
 *
 * Servern svarar på frågan sedan `daily-overview.v1` fick `health.measured_at`
 * (backend #70). Före det gissade den här filen: två nollor fick betyda
 * osynkat, vilket var rätt oftare än det var fel men aldrig sant — en dag
 * någon faktiskt legat still ritades som en dag utan mätning.
 *
 * Gissningen finns kvar som reserv, och det är avsiktligt. Ett svar utan
 * fältet kommer antingen från en äldre server eller ur den lokala cachen, och
 * att läsa `undefined` som »ingenting mätt« hade fått en sparad dag att rita
 * streck där den igår ritade tal. `undefined` är »vet inte«; `null` är »vet,
 * och svaret är ingenting«.
 */
export function healthMeasured(overview: DailyOverview): boolean {
  const health = overview.health;
  if (health.measured_at !== undefined) return health.measured_at !== null;
  return health.steps > 0
    || health.active_calories > 0
    || (health.sleep_minutes ?? 0) > 0;
}

/** The coach's sentence when it wrote one, the rule's when it did not. */
export function heroSentence(overview: DailyOverview, showsTraining: boolean): string {
  const headline = overview.headline?.trim();
  return headline ? headline : ruleBasedSentence(overview, showsTraining);
}
