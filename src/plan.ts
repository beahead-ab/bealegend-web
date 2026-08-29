import { request } from "./api";
import type { TrainingProgramSummary } from "./training";

/**
 * `training-plan.v1` — hela programmet som en tidslinje.
 *
 * `training-home.v1` bär sju dagar, vilket räcker för »den här veckan« men
 * inte för bilden av resan. Det här är den enda ytan i webben som visar en
 * framtid, och varje påstående om den kommer från servern: veckans läge,
 * dagens läge och volymen är uträknade där. En klient som räknade ut vilka
 * veckor som är gjorda hade gissat fem gånger om samma sak.
 */
export type PlanSession = {
  title: string;
  status: string;
  session_type: string;
  modality?: string | null;
  source: string;
  routine_revision_id: string;
  scheduled_session_id?: string | null;
};

export type PlanDay = {
  date: string;
  state: string;
  sessions: PlanSession[];
};

export type PlanWeek = {
  week: number;
  state: string;
  deload: boolean;
  period_name?: string | null;
  period_role?: string | null;
  starts_on: string;
  sessions_planned: number;
  sessions_completed: number;
  /** Veckans lyfta kilon. Null när inget vägt set loggats — en vecka löpning
   *  är inte en vecka då noll kilo lyftes. */
  load_kg?: number | null;
  /** Vad programmet bad om. Null när målet inte går att räkna, och då ritas
   *  ingen jämförelse alls: ett påhittat mål hade fått den som ligger efter
   *  att få veta det av ett tal ingen kan stå för. */
  planned_load_kg?: number | null;
  /** Coachens egen mening om veckan. Null för de flesta. */
  description?: string | null;
  days: PlanDay[];
};

export type TrainingPlan = {
  schema_version: string;
  program: TrainingProgramSummary;
  starts_on: string;
  /** Veckan användaren står i, ettbaserad. */
  current_week: number;
  viewed_date: string;
  weeks: PlanWeek[];
};

export function fetchTrainingPlan(): Promise<TrainingPlan> {
  return request<TrainingPlan>("/api/v1/training/plan");
}

const WEEK_STATE_LABEL: Record<string, string> = {
  completed: "Gjort",
  missed: "Missat",
  current: "Nu",
  upcoming: "Kommer",
};

/**
 * Veckans läge i ett ord.
 *
 * Ett läge servern lagt till och den här klienten inte känner igen lämnas
 * orört i stället för att tystas — ordet är fortfarande sant, och att rita
 * ingenting hade tappat det.
 */
export function weekStateLabel(state: string): string {
  return WEEK_STATE_LABEL[state] ?? state;
}

const DAY_STATE_LABEL: Record<string, string> = {
  planned: "Planerat",
  completed: "Gjort",
  skipped: "Hoppat över",
  extra: "Extra",
  recovery: "Återhämtning",
  rest: "Vila",
};

/**
 * Dagens läge i ett ord — inklusive »Vila«.
 *
 * Vila är frånvaron av ett pass (beslut #109), och just därför kommer ordet
 * från servern: klienten ska slippa uppfinna det ur en tom lista, och två
 * klienter som uppfann det hade skrivit olika.
 */
export function dayStateLabel(state: string): string {
  return DAY_STATE_LABEL[state] ?? state;
}

const number = (value: number) => value.toLocaleString("sv-SE");

/** »2 av 3 pass«, och »3 pass« för en vecka där allt är gjort. */
export function sessionCount(week: PlanWeek): string | null {
  if (week.sessions_planned <= 0) return null;
  if (week.sessions_completed >= week.sessions_planned) {
    return `${number(week.sessions_planned)} pass`;
  }
  return `${number(week.sessions_completed)} av ${number(week.sessions_planned)} pass`;
}

/**
 * Veckans volym: vad som lyfts, och vad programmet bad om.
 *
 * Null när ingetdera talet finns. **Noll är inte samma sak som saknat** — en
 * vecka löpning har inga kilon att visa, och att skriva »0 av 1 500 kg« hade
 * påstått att någon misslyckats med något hen aldrig ombads göra.
 *
 * Målet ritas bara när servern kunde räkna det. Ett program utan
 * belastningsregler, eller en användare vars 1RM vi inte känner till, har
 * inget mål — och ett påhittat hade varit ett tal ingen kan stå för.
 */
export function weekVolume(week: PlanWeek): string | null {
  const done = week.load_kg;
  const planned = week.planned_load_kg;
  if (done == null && planned == null) return null;
  if (done == null) return `${number(planned!)} kg planerat`;
  if (planned == null) return `${number(done)} kg`;
  return `${number(done)} av ${number(planned)} kg`;
}

/**
 * Hur stor andel av veckans mål som är lyft, 0–1, eller null när det inte går
 * att veta. Bara till för att rita en stapel — talet i klartext står bredvid.
 */
export function loadShare(week: PlanWeek): number | null {
  const done = week.load_kg;
  const planned = week.planned_load_kg;
  if (done == null || planned == null || planned <= 0) return null;
  return Math.max(0, Math.min(1, done / planned));
}

const ROLE_LABEL: Record<string, string> = {
  grund: "Grund",
  uppbyggnad: "Uppbyggnad",
  avlastning: "Avlastning",
  topp: "Topp",
  test: "Test",
};

/**
 * Vad veckan hör till: coachens eget periodnamn först, annars rollens.
 *
 * Null när perioden varken har namn eller roll — då säger raden bara veckans
 * nummer, vilket är sant.
 */
export function weekPeriod(week: PlanWeek): string | null {
  const name = (week.period_name ?? "").trim();
  if (name !== "") return name;
  const role = week.period_role;
  if (!role) return null;
  return ROLE_LABEL[role] ?? role;
}

const WEEKDAY = ["sön", "mån", "tis", "ons", "tors", "fre", "lör"];

/**
 * Dagens tre bokstäver, läst ur datumsträngen och inte ur en Date.
 *
 * `new Date("2026-08-24")` är midnatt UTC, alltså dagen innan för alla väster
 * om den — samma fälla som `route.ts` redan undviker. Delarna byggs ihop för
 * hand av samma skäl.
 */
export function weekdayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return WEEKDAY[new Date(year, month - 1, day).getDay()];
}

/** Om dagen är den användaren tittar från. Jämför strängar, inte Date. */
export function isViewedDay(day: PlanDay, plan: TrainingPlan): boolean {
  return day.date === plan.viewed_date;
}

/**
 * Dagen som ett `Date`, byggt av delarna.
 *
 * `new Date("2026-08-24")` är midnatt UTC, alltså dagen innan för alla väster
 * om den — samma fälla som `route.ts` undviker på samma sätt. Den här används
 * för att öppna rätt dags pass ur planen, och en dag fel hade öppnat fel pass.
 */
export function planDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}
