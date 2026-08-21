import { isoDate } from "./daily";

export type Surface = "today" | "session" | "thread";

export type Route = { date: Date; surface: Surface };

/**
 * The surface as it is written in a link. Swedish, because these end up pasted
 * into messages between people — and because there is no reason a URL should be
 * the one place the product speaks another language.
 */
const SURFACE_PARAM: Record<Exclude<Surface, "today">, string> = {
  session: "pass",
  thread: "chatt",
};

const PARAM_SURFACE: Record<string, Surface> = { pass: "session", chatt: "thread" };

function dateFrom(text: string | null): Date | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  // Built from parts rather than parsed: `new Date("2026-08-19")` is midnight
  // UTC, which is the day before for anyone west of it.
  const date = new Date(year, month - 1, day);
  // The constructor rolls over instead of refusing, so month 13 day 45 becomes
  // a real date months away. Reading the parts back is what catches that — a
  // mistyped link should land on today, not on next February.
  const rolled = date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day;
  return rolled ? null : date;
}

export function readRoute(search: string, today: Date = new Date()): Route {
  const params = new URLSearchParams(search);
  return {
    date: dateFrom(params.get("d")) ?? today,
    surface: PARAM_SURFACE[params.get("v") ?? ""] ?? "today",
  };
}

/**
 * The query for a route, or "" for today's day view. Today and the day surface
 * are the default, so the address people see most is a bare "/" rather than a
 * URL restating where they already are.
 */
export function routeSearch(route: Route, today: Date = new Date()): string {
  const params = new URLSearchParams();
  if (isoDate(route.date) !== isoDate(today)) params.set("d", isoDate(route.date));
  if (route.surface !== "today") params.set("v", SURFACE_PARAM[route.surface]);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.surface === b.surface && isoDate(a.date) === isoDate(b.date);
}
