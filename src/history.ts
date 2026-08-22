import { request } from "./api";
import { isoDate } from "./daily";

/** `history.v1`, only the fields the home surface draws. */
export type HistoryDay = {
  date: string;
  weight_kg: number | null;
  resting_heart_rate_bpm: number | null;
};

export type HistoryRun = {
  id: string;
  title: string;
  session_type: string;
  completed_at: string;
  active_seconds: number;
};

export type HistoryWindow = {
  days: HistoryDay[];
  training_runs: HistoryRun[];
};

export type DateRange = { from: Date; to: Date };

/**
 * The web has no goal-start date in any contract it fetches, so it cannot honour
 * `sinceGoalStart` literally. It shows the longest window it knows how to ask
 * for instead — and every window word labels the range it actually drew, so the
 * surface never implies a starting point it does not have.
 */
const SCOPE_DAYS: Record<string, number> = {
  last7Days: 7,
  last30Days: 30,
  sinceGoalStart: 90,
};

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  // Monday, because the Swedish week starts there and `getDay()` does not.
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

/** The days a scope covers, counted back from the day the surface is showing. */
export function rangeFor(scope: string, date: Date): DateRange {
  if (scope === "thisWeek") return { from: startOfWeek(date), to: date };
  const days = SCOPE_DAYS[scope] ?? SCOPE_DAYS.last7Days;
  return { from: addDays(date, -(days - 1)), to: date };
}

/** The one range that covers every scope asked for, so a surface with three
 *  window words still costs a single request. */
export function coveringRange(scopes: string[], date: Date): DateRange | null {
  if (scopes.length === 0) return null;
  const froms = scopes.map((scope) => rangeFor(scope, date).from.getTime());
  return { from: new Date(Math.min(...froms)), to: date };
}

const SCOPE_LABEL: Record<string, string> = {
  last7Days: "7 dagar",
  last30Days: "30 dagar",
  thisWeek: "Denna vecka",
  sinceGoalStart: "90 dagar",
};

/** What the window actually covers, in the reader's words. Kept beside
 *  [rangeFor] so a changed window cannot leave a stale label behind. */
export function rangeLabel(scope: string): string {
  return SCOPE_LABEL[scope] ?? SCOPE_LABEL.last7Days;
}

export function fetchHistory(range: DateRange): Promise<HistoryWindow> {
  const params = new URLSearchParams({
    from: isoDate(range.from),
    to: isoDate(range.to),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  return request<HistoryWindow>(`/api/v1/history?${params}`);
}

export function withinRange(iso: string, range: DateRange): boolean {
  return iso >= isoDate(range.from) && iso <= isoDate(range.to);
}
