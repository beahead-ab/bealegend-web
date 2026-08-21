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
export function setLine(set: PrescribedSet, showRest = true): string {
  const parts: string[] = [];
  const each = measure(set.repetitions, set.duration_seconds, set.distance_meters);
  if (each) parts.push(each);
  if (set.suggested_weight_kg != null) {
    parts.push(`${set.suggested_weight_kg.toLocaleString("sv-SE")} kg`);
  }
  if (set.target_rpe != null) parts.push(`RPE ${set.target_rpe.toLocaleString("sv-SE")}`);
  else if (set.target_rir != null) parts.push(`${set.target_rir} RIR`);
  if (showRest) {
    const rest = restLabel(set.rest_seconds);
    if (rest) parts.push(rest);
  }
  return parts.join(" · ");
}

/**
 * The rest, when every set shares it. Four sets that each repeat "1 min 30 s
 * vila" say one thing four times and bury the numbers that actually differ —
 * so the shared rest is lifted out and said once. Null when the sets disagree,
 * because then it belongs on each line after all.
 */
export function sharedRest(sets: PrescribedSet[]): number | null {
  if (sets.length === 0) return null;
  const first = sets[0].rest_seconds;
  if (first <= 0) return null;
  return sets.every((set) => set.rest_seconds === first) ? first : null;
}
