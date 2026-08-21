import { request } from "./api";
import { swedishNumber, type DailyOverview } from "./daily";

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

type Word = {
  title: string;
  group: WidgetGroup;
  /** Null when the day carries no value — the row is left out rather than
   *  shown as a zero, which would read as a real measurement. */
  value: (overview: DailyOverview) => string | null;
  progress?: (overview: DailyOverview) => number | null;
  opensTraining?: boolean;
};

function goalValue(value: number, goal: number | null, unit: string): string {
  if (!goal || goal <= 0) return `${swedishNumber(value)} ${unit}`;
  return `${swedishNumber(value)} av ${swedishNumber(goal)} ${unit}`;
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
    value: (overview) => goalValue(overview.macros.protein, overview.macros.protein_goal, "g"),
  },
  "daily.carbs": {
    title: "Kolhydrater",
    group: "Näring",
    value: (overview) => goalValue(overview.macros.carbs, overview.macros.carbs_goal, "g"),
  },
  "daily.fat": {
    title: "Fett",
    group: "Näring",
    value: (overview) => goalValue(overview.macros.fat, overview.macros.fat_goal, "g"),
  },
  "daily.steps": {
    title: "Steg",
    group: "Hälsa",
    value: (overview) => {
      const health = overview.health;
      if (health.step_goal <= 0) return swedishNumber(health.steps);
      return `${swedishNumber(health.steps)} av ${swedishNumber(health.step_goal)}`;
    },
    progress: (overview) =>
      overview.health.step_goal > 0 ? overview.health.steps / overview.health.step_goal : null,
  },
  "daily.activeEnergy": {
    title: "Aktiva kalorier",
    group: "Hälsa",
    value: (overview) => `${swedishNumber(overview.health.active_calories)} kcal`,
  },
  "training.todaySession": {
    title: "Dagens pass",
    group: "Träning",
    value: () => "",
    opensTraining: true,
  },
};

/**
 * What this build can draw. The server gates by client version, so this is the
 * belt to that pair of braces — and the only safe way to be wrong about a word
 * is to render nothing for it.
 */
export const RENDERABLE = new Set(["metricRow", "horizontalBudget"]);

export function canRender(widget: DashboardWidget): boolean {
  return WORDS[widget.binding] !== undefined && RENDERABLE.has(widget.presentation);
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
