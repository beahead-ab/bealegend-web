import { request } from "./api";
import { isoDate } from "./daily";

/** `training-home.v1`, only the fields this client draws. */
export type PrescribedSet = {
  index: number;
  repetitions: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rest_seconds: number;
  target_rpe: number | null;
  target_rir: number | null;
  suggested_weight_kg: number | null;
  notes: string;
  /**
   * Taken från ordinationens spann. Det befintliga fältet ovan är golvet,
   * `_max` är taket, och null betyder att ordinationen är en punkt.
   *
   * Coachen skriver sällan ett tal. »RPE 7–8« och »vila 90–120 s« är vad som
   * står i programmet, och att rita golvet ensamt gjorde ordinationen
   * strängare än den var menad.
   */
  rest_seconds_max?: number | null;
  target_rpe_max?: number | null;
  target_rir_max?: number | null;
  /** Andel av 1RM. Servern räknar ut den ur load_rule; klienten läser bara. */
  percent_1rm?: number | null;
  percent_1rm_max?: number | null;
};

export type TrainingMoment = {
  id: string;
  phase: string;
  position: number;
  block_item_position: number;
  name: string;
  description: string;
  sets: number;
  repetitions: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rest_seconds: number;
  notes: string;
  prescribed_sets: PrescribedSet[];
};

export type TrainingSession = {
  id: string;
  title: string;
  summary: string;
  session_type: string;
  execution_mode: string;
  is_extra: boolean;
  estimated_seconds: number | null;
  moments: TrainingMoment[];
};

/** The seven things a client may ask of a running pass. The server decides
 *  which are legal right now and says so in `allowed_actions` — this list is
 *  the vocabulary, not the state machine. */
export type RunAction =
  | "pause"
  | "resume"
  | "complete_set"
  | "skip_set"
  | "complete_step"
  | "complete"
  | "cancel";

export type TrainingRun = {
  id: string;
  session_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  active_seconds: number;
  current_step_id: string | null;
  current_set_index: number;
  state_version: number;
  allowed_actions: RunAction[];
  paused_at: string | null;
  accumulated_pause_seconds: number;
};

/**
 * A run nothing more can be asked of. The server's own table allows every
 * action only from `active` or `paused`, so a queue still holding commands for
 * one of these is holding work that can never land.
 */
export const FINISHED_STATUSES = new Set(["completed", "completed_partial", "cancelled", "discarded"]);

export function isFinished(run: TrainingRun): boolean {
  return FINISHED_STATUSES.has(run.status);
}

/**
 * Reads a step's place in the pass out of the session the surface is showing.
 * The run itself only names its current step, and a name cannot be ahead or
 * behind — the order lives in the session.
 */
export function ordinalsFrom(session: TrainingSession): (stepId: string) => number | null {
  const order = new Map(session.moments.map((moment, index) => [moment.id, index]));
  return (stepId) => order.get(stepId) ?? null;
}

export type TrainingHome = {
  schema_version: string;
  today_sessions: TrainingSession[];
  extra_sessions: TrainingSession[];
  /** The server allows one run at a time per user, so this is what stops the
   *  surface offering a start it already knows would be refused. */
  active_run: TrainingRun | null;
  active_session: TrainingSession | null;
};

export function fetchTrainingHome(date: Date): Promise<TrainingHome> {
  return request<TrainingHome>(`/api/v1/training/home?date=${isoDate(date)}`);
}

/**
 * The one mode the web can run honestly. The others are built around sensors a
 * browser does not have — a continuous run needs GPS the whole way, intervals
 * need a timer the phone keeps while locked, and the card deck needs the watch.
 * Drawing them as though they were runnable here would promise a pass the web
 * cannot finish.
 */
export const RUNNABLE_MODES = new Set(["sequential_sets"]);

export function canRun(session: TrainingSession): boolean {
  return RUNNABLE_MODES.has(session.execution_mode);
}

const MODE_REASON: Record<string, string> = {
  continuous_tracking: "Det här passet spårar din position hela vägen. Kör det i appen.",
  intervals: "Intervallpass behöver en klocka som går vidare med skärmen släckt. Kör det i appen.",
  card_deck: "Kortleken körs på klockan.",
};

/** Why a pass cannot be run here, in the reader's words. Never a bare refusal:
 *  the reason is what tells them where to go instead. */
export function modeReason(session: TrainingSession): string {
  return MODE_REASON[session.execution_mode] ?? "Det här passet går inte att köra i webben än. Kör det i appen.";
}

const PHASE_LABEL: Record<string, string> = {
  warmup: "Uppvärmning",
  main: "Huvuddel",
  cooldown: "Nedvarvning",
};

export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}

export type Block = { position: number; moments: TrainingMoment[] };

/**
 * The blocks a pass is made of. The server returns the moments already ordered —
 * by block, then phase, then position — and it applies the user's own
 * per-occasion adjustments while doing it. Sorting here would quietly undo them,
 * so this only groups runs of consecutive moments, exactly as the dashboard's
 * sections do.
 */
export function blocks(session: TrainingSession): Block[] {
  const result: Block[] = [];
  for (const moment of session.moments) {
    const last = result[result.length - 1];
    if (last && last.position === moment.block_item_position) {
      last.moments.push(moment);
    } else {
      result.push({ position: moment.block_item_position, moments: [moment] });
    }
  }
  return result;
}

/**
 * A prescribed time, said exactly. Rounding to whole minutes would turn the
 * most common rest in strength training — 90 seconds — into "2 min", which is
 * a third longer than the pass asks for.
 */
function exactDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

/** An estimate, said roughly. Seconds in an "about" are false precision. */
function roughDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

export function restLabel(seconds: number): string | null {
  return seconds > 0 ? `${exactDuration(seconds)} vila` : null;
}

export function estimateLabel(seconds: number | null): string | null {
  return seconds && seconds > 0 ? `ca ${roughDuration(seconds)}` : null;
}

function measure(
  repetitions: number | null,
  durationSeconds: number | null,
  distanceMeters: number | null,
): string | null {
  if (repetitions != null) return `${repetitions} reps`;
  if (durationSeconds != null) return exactDuration(durationSeconds);
  if (distanceMeters != null) {
    return distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toLocaleString("sv-SE")} km`
      : `${distanceMeters.toLocaleString("sv-SE")} m`;
  }
  return null;
}

/** The moment's shape in one line: "3 × 8 reps". Falls back to the set count
 *  alone rather than inventing a measure the prescription does not carry. */
export function momentPrescription(moment: TrainingMoment): string {
  const each = measure(moment.repetitions, moment.duration_seconds, moment.distance_meters);
  const sets = Math.max(moment.sets, 1);
  if (!each) return `${sets} set`;
  return `${sets} × ${each}`;
}

/**
 * One prescribed set. Weight comes from the user's own strength maxima, so it is
 * shown as a suggestion to confirm rather than a number to look up — which is
 * also why it is spelled out here and not left to the input field alone.
 */
/**
 * Whether finishing here means finishing early. The server marks such a run
 * `completed_partial` — saved and counted, but honest that the pass was not
 * run to its end, which is a different thing from cancelling it.
 */
export function isEarlyFinish(session: TrainingSession, run: TrainingRun): boolean {
  if (run.current_step_id === null) return false;
  const last = session.moments[session.moments.length - 1];
  return last !== undefined && last.id !== run.current_step_id;
}

/**
 * RPE in words. The scale is a number the app inherited from the training
 * world, and a number alone tells a beginner nothing — "RPE 8" is only
 * meaningful if you already know it means two reps left in the tank. The
 * sentence is what the number means, so both can be shown and the number stops
 * being a password.
 *
 * Written from the effort's own side ("två rep kvar"), not as a judgement.
 */
export function rpeWords(rpe: number): string {
  if (rpe >= 10) return "inget mer rep fanns";
  if (rpe >= 9.5) return "kanske ett till";
  if (rpe >= 9) return "ett rep kvar";
  if (rpe >= 8.5) return "ett till två kvar";
  if (rpe >= 8) return "två rep kvar";
  if (rpe >= 7) return "tre rep kvar";
  if (rpe >= 6) return "fyra rep kvar";
  return "lätt, många rep kvar";
}

/** RPE as it should be read out: the number, then what it means. */
export function rpeLine(rpe: number): string {
  return `RPE ${rpe.toLocaleString("sv-SE")} · ${rpeWords(rpe)}`;
}

const number = (value: number) => value.toLocaleString("sv-SE");

/**
 * Ett spann, eller ett tal.
 *
 * Halvt streck (–), inte bindestreck: »7–8« är ett intervall, »7-8« läses som
 * ett avbrott. Taket ritas bara när det säger något nytt — ett spann där golv
 * och tak är lika är en punkt, och att skriva »RPE 8–8« hade fått en
 * ordination att se osäker ut utan att vara det.
 */
export function span(
  floor: number | null,
  ceiling: number | null | undefined,
  format: (value: number) => string = number,
): string | null {
  if (floor == null) return null;
  if (ceiling == null || ceiling <= floor) return format(floor);
  return `${format(floor)}–${format(ceiling)}`;
}

/**
 * Ordinationen som en rad.
 *
 * [executing] är setet som körs just nu. Då kollapsar spannen till sitt golv:
 * mitt i ett set behöver man ett tal att gå på, inte ett fönster att välja i,
 * och golvet är det ordinationen alltid garanterar. Fönstret står kvar på
 * raderna omkring, där det är information snarare än ett val att fatta.
 */
export function setLine(set: PrescribedSet, showRest = true, executing = false): string {
  const to = <T,>(ceiling: T) => (executing ? null : ceiling);
  const parts: string[] = [];
  const each = measure(set.repetitions, set.duration_seconds, set.distance_meters);
  if (each) parts.push(each);
  if (set.suggested_weight_kg != null) {
    parts.push(`${number(set.suggested_weight_kg)} kg`);
  }
  // Andelen av 1RM står efter vikten och före ansträngningen: den säger vad
  // vikten är, inte hur det ska kännas.
  const percent = span(set.percent_1rm ?? null, to(set.percent_1rm_max));
  if (percent) parts.push(`${percent} % av 1RM`);
  const rpe = span(set.target_rpe ?? null, to(set.target_rpe_max));
  if (rpe) parts.push(`RPE ${rpe}`);
  else {
    const rir = span(set.target_rir ?? null, to(set.target_rir_max));
    if (rir) parts.push(`${rir} RIR`);
  }
  if (showRest) {
    const rest = restSpan(set, executing);
    if (rest) parts.push(rest);
  }
  return parts.join(" · ");
}

/** »90–120 s vila«, eller »1 min 30 s vila« när ordinationen är en punkt. */
export function restSpan(set: PrescribedSet, executing = false): string | null {
  if (set.rest_seconds <= 0) return null;
  const ceiling = executing ? null : set.rest_seconds_max;
  if (ceiling == null || ceiling <= set.rest_seconds) return restLabel(set.rest_seconds);
  // Sekunder rakt av i ett spann: "1 min 30 s–2 min" är två format i samma
  // andetag och läses långsammare än talen det bär.
  return `${set.rest_seconds}–${ceiling} s vila`;
}

/**
 * The rest, when every set shares it. Four sets that each repeat "1 min 30 s
 * vila" say one thing four times and bury the numbers that actually differ —
 * so the shared rest is lifted out and said once. Null when the sets disagree,
 * because then it belongs on each line after all.
 */
export function sharedRest(sets: PrescribedSet[]): PrescribedSet | null {
  if (sets.length === 0) return null;
  const first = sets[0];
  if (first.rest_seconds <= 0) return null;
  // Både golv och tak måste stämma. Fyra set med samma golv men olika tak har
  // inte samma vila, och att lyfta ut den hade dolt just skillnaden.
  const same = sets.every((set) =>
    set.rest_seconds === first.rest_seconds
    && (set.rest_seconds_max ?? null) === (first.rest_seconds_max ?? null));
  return same ? first : null;
}
