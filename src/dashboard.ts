import { request } from "./api";
import { swedishNumber, type DailyOverview } from "./daily";
import { withinRange, type DateRange, type HistoryWindow } from "./history";

export type DashboardWidget = {
  binding: string;
  scope: string;
  presentation: string;
  size: string;
  /** The goal behind a countdown. Absent on every other word — daily goals
   *  live in the profile, and the server refuses them here. */
  target?: number | null;
  deadline?: string | null;
  direction?: string | null;
  measure?: string | null;
  label?: string | null;
};

/**
 * The countdown, already computed. Pace, forecast and status are the server's
 * arithmetic — this surface renders them and never derives them, which is what
 * keeps the phone, the watch and the browser from disagreeing about the same
 * goal.
 */
export type CountdownStatus = {
  binding: string;
  title: string;
  deadline: string;
  days_left: number;
  target: number | null;
  direction: string | null;
  latest_value: number | null;
  latest_value_date: string | null;
  remaining: number | null;
  pace_per_week: number | null;
  pace_required_per_week: number | null;
  projected_arrival: string | null;
  projected_arrival_early: string | null;
  projected_arrival_late: string | null;
  status: string;
};

export type DashboardConfig = {
  schema_version: string;
  revision: number;
  widgets: DashboardWidget[];
  countdowns?: CountdownStatus[] | null;
};

/** What a range bar draws: the measurement, and the band it is measured
 *  against. Both bounds null is the honest no-goal case, and the bar then
 *  draws a dashed scale instead of inventing one. */
export type RangeReading = {
  value: number | null;
  min: number | null;
  max: number | null;
  text: string;
  band: string | null;
};

export function fetchDashboard(): Promise<DashboardConfig> {
  return request<DashboardConfig>("/api/v1/dashboard");
}

export type WidgetGroup = "Näring" | "Träning" | "Hälsa";

export type SeriesPoint = { date: string; value: number };

export type ListItem = { id: string; label: string; detail: string };

type Word = {
  title: string;
  group: WidgetGroup;
  /**
   * Where the word reads from: the single day on screen, or the window of days
   * behind it. This is what the surface consults before fetching — a home
   * screen with no window word must not pay for a history request.
   */
  source: "day" | "window";
  /** Null when the day carries no value — the row is left out rather than
   *  shown as a zero, which would read as a real measurement. */
  value?: (overview: DailyOverview, history?: HistoryWindow | null, range?: DateRange) => string | null;
  /**
   * Whether anything was actually measured for this word. False draws the
   * empty form — a dash and a dashed scale — and the value is never consulted.
   *
   * Distinct from `value` returning null, which means the word cannot be drawn
   * at all and the row is left out. Silence and absence look alike in a zero,
   * and only the word knows which one it is looking at.
   */
  measured?: (overview: DailyOverview, history?: HistoryWindow | null, range?: DateRange) => boolean;
  progress?: (overview: DailyOverview) => number | null;
  series?: (history: HistoryWindow, range: DateRange) => SeriesPoint[];
  items?: (overview: DailyOverview, history: HistoryWindow | null, range: DateRange) => ListItem[];
  /** An interval word: the measurement against the user's own floor and
   *  ceiling. Never against an opinion — with no goal set, the bounds are null
   *  and the bar says so. */
  range?: (overview: DailyOverview) => RangeReading | null;
  /** A countdown draws from the config's computed statuses rather than from
   *  the day, so the reader is a marker: the word can be drawn, by that. */
  countdown?: true;
  unit?: string;
  /** What a series or list word says when the window holds nothing. Owned by
   *  the word, because only the word knows what was missing. */
  empty?: string;
  opensTraining?: boolean;
};

/**
 * Whether the day holds any food at all.
 *
 * Reading the macros as well as the meals rather than the meals alone: a macro
 * can arrive from somewhere the meal list does not show, and a word that called
 * a real gram silence would be worse than one that draws a dash too rarely.
 */
function loggedAnything(overview: DailyOverview): boolean {
  const macros = overview.macros;
  return (overview.meals?.length ?? 0) > 0 || macros.protein + macros.carbs + macros.fat > 0;
}

/**
 * Whether anything from the health source reached this day.
 *
 * The web has no local sensor: steps and active calories arrive from the
 * server, having arrived there from a phone. Both at exactly nought means
 * nothing has been synced, far more often than it means a person lay still for
 * a whole day — and "0 av 10 000" at seven in the morning reads as a failed
 * goal rather than as a day that has not started.
 *
 * A genuinely motionless day draws a dash too. That is the error worth having:
 * the surface says nothing rather than something wrong about the reader.
 */
function healthSynced(overview: DailyOverview): boolean {
  const health = overview.health;
  return health.steps > 0 || health.active_calories > 0;
}

function goalValue(value: number, goal: number | null, unit: string): string {
  if (!goal || goal <= 0) return `${swedishNumber(value)} ${unit}`;
  return `${swedishNumber(value)} av ${swedishNumber(goal)} ${unit}`;
}

function goalProgress(value: number, goal: number | null): number | null {
  return goal && goal > 0 ? value / goal : null;
}

/** The local day a UTC instant fell on. Slicing the instant's own text would
 *  file a session finished at 01:00 in Stockholm under the day before. */
/** 7 h 30 min, the way a person says it. Minutes alone would make the reader
 *  do the division. */
export function hoursAndMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Where the night fell relative to the user's own window. Deliberately plain:
 * "under ditt fönster", not a verdict. The floor and the ceiling are the
 * user's, so the sentence describes rather than judges.
 */
function sleepBand(value: number | null, min: number | null, max: number | null): string | null {
  if (value == null) return null;
  if (min != null && value < min) return "under ditt fönster";
  if (max != null && value > max) return "över ditt fönster";
  return "i ditt fönster";
}

function weekCount(history: HistoryWindow, range: DateRange): number {
  return (history.training_runs ?? [])
    .filter((run) => withinRange(localDay(run.completed_at), range)).length;
}

function localDay(instant: string): string {
  const date = new Date(instant);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * The client's half of the vocabulary: what each word looks like. The server
 * owns which words exist and which forms are permitted; this owns their
 * appearance. Ported from the iOS client so the two surfaces cannot drift —
 * a binding named in one and missing from the other is a silent difference
 * between clients.
 */
export const WORDS: Record<string, Word> = {
  "daily.energyBudget": {
    title: "Kalorier",
    group: "Näring",
    source: "day",
    value: (overview) => {
      const calories = overview.calories;
      if (!calories.can_calculate) return null;
      return calories.is_over
        ? `${swedishNumber(Math.abs(calories.remaining))} över`
        : `${swedishNumber(calories.remaining)} kvar`;
    },
    progress: (overview) => {
      const calories = overview.calories;
      if (!calories.can_calculate || calories.goal <= 0) return null;
      return calories.consumed / calories.goal;
    },
  },
  "daily.protein": {
    title: "Protein",
    group: "Näring",
    source: "day",
    unit: "g",
    measured: loggedAnything,
    value: (overview) => goalValue(overview.macros.protein, overview.macros.protein_goal, "g"),
    progress: (overview) => goalProgress(overview.macros.protein, overview.macros.protein_goal),
  },
  "daily.carbs": {
    title: "Kolhydrater",
    group: "Näring",
    source: "day",
    unit: "g",
    measured: loggedAnything,
    value: (overview) => goalValue(overview.macros.carbs, overview.macros.carbs_goal, "g"),
    progress: (overview) => goalProgress(overview.macros.carbs, overview.macros.carbs_goal),
  },
  "daily.fat": {
    title: "Fett",
    group: "Näring",
    source: "day",
    unit: "g",
    measured: loggedAnything,
    value: (overview) => goalValue(overview.macros.fat, overview.macros.fat_goal, "g"),
    progress: (overview) => goalProgress(overview.macros.fat, overview.macros.fat_goal),
  },
  "daily.meals": {
    title: "Dagens måltider",
    group: "Näring",
    source: "day",
    empty: "Inget loggat än.",
    items: (overview) =>
      [...(overview.meals ?? [])]
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
        .map((meal) => ({
          id: meal.id,
          label: meal.description?.trim() || "Måltid",
          detail: `${swedishNumber(meal.calories)} kcal`,
        })),
  },
  "daily.steps": {
    title: "Steg",
    group: "Hälsa",
    source: "day",
    measured: healthSynced,
    value: (overview) => {
      const health = overview.health;
      if (health.step_goal <= 0) return swedishNumber(health.steps);
      return `${swedishNumber(health.steps)} av ${swedishNumber(health.step_goal)}`;
    },
    progress: (overview) => goalProgress(overview.health.steps, overview.health.step_goal),
  },
  "daily.activeEnergy": {
    title: "Aktiva kalorier",
    group: "Hälsa",
    source: "day",
    measured: healthSynced,
    value: (overview) => `${swedishNumber(overview.health.active_calories)} kcal`,
  },
  "health.weight": {
    title: "Vikttrend",
    group: "Hälsa",
    source: "window",
    unit: "kg",
    empty: "Inget vägt den här perioden.",
    series: (history, range) =>
      history.days
        .filter((day) => day.weight_kg != null && withinRange(day.date, range))
        .map((day) => ({ date: day.date, value: day.weight_kg as number }))
        .sort((a, b) => a.date.localeCompare(b.date)),
  },
  "health.restingHeartRate": {
    title: "Vilopuls",
    group: "Hälsa",
    source: "window",
    unit: "slag/min",
    empty: "Ingen vilopuls uppmätt den här perioden.",
    series: (history, range) =>
      history.days
        .filter((day) => day.resting_heart_rate_bpm != null && withinRange(day.date, range))
        .map((day) => ({ date: day.date, value: day.resting_heart_rate_bpm as number }))
        .sort((a, b) => a.date.localeCompare(b.date)),
  },
  "training.todaySession": {
    title: "Dagens pass",
    group: "Träning",
    source: "day",
    value: () => "",
    opensTraining: true,
  },
  "daily.sleep": {
    title: "Sömn",
    group: "Hälsa",
    source: "day",
    range: (overview) => {
      const health = overview.health;
      const value = health.sleep_minutes ?? null;
      const min = health.sleep_goal_min_minutes ?? null;
      const max = health.sleep_goal_max_minutes ?? null;
      return {
        value,
        min,
        max,
        text: value == null ? "Inget mätt i natt" : hoursAndMinutes(value),
        band: min == null && max == null ? null : sleepBand(value, min, max),
      };
    },
  },
  "training.weekVolume": {
    title: "Veckans pass",
    group: "Träning",
    source: "window",
    empty: "Inga pass den här veckan.",
    measured: (_overview, history, range) => !!history && !!range && weekCount(history, range) > 0,
    value: (_overview, history, range) => {
      if (!history || !range) return null;
      const count = weekCount(history, range);
      return count === 1 ? "1 pass" : `${count} pass`;
    },
  },
  "goal.countdown": {
    title: "Nedräkning",
    group: "Hälsa",
    source: "day",
    countdown: true,
  },
  "training.recentSessions": {
    title: "Senaste passen",
    group: "Träning",
    source: "window",
    empty: "Inga pass den här perioden.",
    items: (_overview, history, range) =>
      (history?.training_runs ?? [])
        .filter((run) => withinRange(localDay(run.completed_at), range))
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
        .map((run) => ({
          id: run.id,
          label: run.title,
          detail: `${new Date(run.completed_at).toLocaleDateString("sv-SE", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })} · ${Math.max(1, Math.round(run.active_seconds / 60))} min`,
        })),
  },
};

/**
 * Which reader a form draws from. A configuration that pairs a word with a form
 * it cannot fill — a list drawn as a row — is skipped rather than rendered as a
 * blank, which is the same promise the server's shape rules make on its side.
 */
const FORM_READER: Record<string, keyof Word> = {
  metricRow: "value",
  horizontalBudget: "value",
  ring: "progress",
  lineChart: "series",
  list: "items",
  rangeBar: "range",
  countdown: "countdown",
};

/**
 * What this build can draw. The server gates by client version, so this is the
 * belt to that pair of braces — and the only safe way to be wrong about a word
 * is to render nothing for it.
 */
export const RENDERABLE = new Set(Object.keys(FORM_READER));

export function canRender(widget: DashboardWidget): boolean {
  const word = WORDS[widget.binding];
  if (!word) return false;
  const reader = FORM_READER[widget.presentation];
  return reader !== undefined && word[reader] !== undefined;
}

/** The scopes the surface has to fetch a window for, empty when it does not. */
export function windowScopes(widgets: DashboardWidget[]): string[] {
  return widgets
    .filter((widget) => canRender(widget) && WORDS[widget.binding].source === "window")
    .map((widget) => widget.scope);
}

export type DashboardSection = { group: WidgetGroup; widgets: DashboardWidget[]; hero: boolean };

/**
 * The surface shows six things and puts the rest behind a word. Not a cap —
 * the configuration may hold eight — but a home screen that opens with
 * everything at once is the crowding the navigation concept removed.
 */
export const VISIBLE_BEFORE_MORE = 6;

export function visibleWidgets(widgets: DashboardWidget[], expanded: boolean): DashboardWidget[] {
  const drawable = widgets.filter(canRender);
  return expanded ? drawable : drawable.slice(0, VISIBLE_BEFORE_MORE);
}

export function hiddenCount(widgets: DashboardWidget[]): number {
  return Math.max(0, widgets.filter(canRender).length - VISIBLE_BEFORE_MORE);
}

/**
 * Cards are runs of consecutive widgets sharing a group — never a sort. Sorting
 * would quietly undo "lägg träningen överst": the row would move and the card
 * would stay put.
 */
export function sections(widgets: DashboardWidget[]): DashboardSection[] {
  const result: DashboardSection[] = [];
  for (const widget of widgets) {
    if (!canRender(widget)) continue;
    const group = WORDS[widget.binding].group;
    const hero = widget.size === "large";
    const last = result[result.length - 1];
    // A hero stands alone. Folding it into a group card would make it a row
    // among rows, which is the one thing the size was asking not to be.
    if (last && last.group === group && !hero && !last.hero) {
      last.widgets.push(widget);
    } else {
      result.push({ group, widgets: [widget], hero });
    }
  }
  return result;
}
