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
  health: { steps: number; step_goal: number; active_calories: number };
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    protein_goal: number | null;
    carbs_goal: number | null;
    fat_goal: number | null;
  };
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

/** The coach's sentence when it wrote one, the rule's when it did not. */
export function heroSentence(overview: DailyOverview, showsTraining: boolean): string {
  const headline = overview.headline?.trim();
  return headline ? headline : ruleBasedSentence(overview, showsTraining);
}
