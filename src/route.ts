import { isoDate } from "./daily";

export type Surface = "today" | "session" | "program" | "plan";

export type Route = {
  date: Date;
  surface: Surface;
  /**
   * Samtalet ligger ovanpå den yta man arbetar i. På mobil ritar CSS bara
   * samtalet; på bred webb ritas samma tråd som en panel bredvid ytan.
   *
   * Valet ligger i adressen. En omladdning tappar därför varken panelen eller
   * det som stod bakom den, och en ren ny adress börjar alltid stängd.
   */
  chatOpen?: boolean;
  /**
   * Programmet man tittar på, när det inte är det man följer.
   *
   * Bara meningsfullt på programytan. Adressen bär det så att ett program man
   * överväger går att skicka till någon annan — vilket är hela poängen med att
   * ha en sida för det.
   */
  program?: string | null;
};

/**
 * The surface as it is written in a link. Swedish, because these end up pasted
 * into messages between people — and because there is no reason a URL should be
 * the one place the product speaks another language.
 */
const SURFACE_PARAM: Record<Exclude<Surface, "today">, string> = {
  session: "pass",
  program: "program",
  plan: "planen",
};

const PARAM_SURFACE: Record<string, Surface> = {
  pass: "session",
  program: "program",
  planen: "plan",
};

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
  const chatOpen = params.get("v") === "chatt";
  const surfaceParam = chatOpen ? params.get("bak") : params.get("v");
  return {
    date: dateFrom(params.get("d")) ?? today,
    surface: PARAM_SURFACE[surfaceParam ?? ""] ?? "today",
    chatOpen,
    program: params.get("p"),
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
  if (route.chatOpen) {
    params.set("v", "chatt");
    if (route.surface !== "today") params.set("bak", SURFACE_PARAM[route.surface]);
  } else if (route.surface !== "today") {
    params.set("v", SURFACE_PARAM[route.surface]);
  }
  // Bara på programytan. Ett program-id i adressen till Idag hade sagt något
  // om en yta som inte visar något program.
  if (route.surface === "program" && route.program) params.set("p", route.program);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.surface === b.surface
    && !!a.chatOpen === !!b.chatOpen
    && isoDate(a.date) === isoDate(b.date)
    && (a.program ?? null) === (b.program ?? null);
}
