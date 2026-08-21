import { request } from "./api";
import { swedishNumber, type DailyOverview } from "./daily";
import { withinRange, type DateRange, type HistoryWindow } from "./history";

export type DashboardWidget = {
  binding: string;
  scope: string;
  presentation: string;
  size: string;
};

export type DashboardConfig = {
  schema_version: string;
  revision: number;
  widgets: DashboardWidget[];
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
  value?: (overview: DailyOverview) => string | null;
  progress?: (overview: DailyOverview) => number | null;
  series?: (history: HistoryWindow, range: DateRange) => SeriesPoint[];
  items?: (overview: DailyOverview, history: HistoryWindow | null, range: DateRange) => ListItem[];
  unit?: string;
  /** What a series or list word says when the window holds nothing. Owned by
   *  the word, because only the word knows what was missing. */
  empty?: string;
  opensTraining?: boolean;
};

function goalValue(value: number, goal: number | null, unit: string): string {
  if (!goal || goal <= 0) return `${swedishNumber(value)} ${unit}`;
  return `${swedishNumber(value)} av ${swedishNumber(goal)} ${unit}`;
}

function goalProgress(value: number, goal: number | null): number | null {
  return goal && goal > 0 ? value / goal : null;
}

/** The local day a UTC instant fell on. Slicing the instant's own text would
 *  file a session finished at 01:00 in Stockholm under the day before. */
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
    value: (overview) => goalValue(overview.macros.protein, overview.macros.protein_goal, "g"),
    progress: (overview) => goalProgress(overview.macros.protein, overview.macros.protein_goal),
  },
  "daily.carbs": {
    title: "Kolhydrater",
    group: "Näring",
    source: "day",
    unit: "g",
    value: (overview) => goalValue(overview.macros.carbs, overview.macros.carbs_goal, "g"),
    progress: (overview) => goalProgress(overview.macros.carbs, overview.macros.carbs_goal),
  },
  "daily.fat": {
    title: "Fett",
    group: "Näring",
    source: "day",
    unit: "g",
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
  "training.todaySession": {
    title: "Dagens pass",
    group: "Träning",
    source: "day",
    value: () => "",
    opensTraining: true,
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

export type DashboardSection = { group: WidgetGroup; widgets: DashboardWidget[] };

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
    const last = result[result.length - 1];
    if (last && last.group === group) {
      last.widgets.push(widget);
    } else {
      result.push({ group, widgets: [widget] });
    }
  }
  return result;
}
