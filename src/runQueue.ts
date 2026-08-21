import { ApiError, newCommandId, request, staleRunFrom } from "./api";
import { isFinished, type RunAction, type TrainingRun } from "./training";

/**
 * One thing the user did, on its way to the server.
 *
 * [occurred_at] is stamped when the user acted, never when the command is sent.
 * A set logged in the basement and delivered twenty minutes later happened when
 * it happened, and the server records what it is told.
 */
export type QueuedCommand = {
  command_id: string;
  run_id: string;
  action: RunAction;
  expected_version: number;
  occurred_at: string;
  device_id: string;
  device_sequence: number;
  /** How many times a conflict has pushed this command onto a newer version. */
  attempts: number;
  step_id?: string;
  set_index?: number;
  repetitions?: number;
  weight_kg?: number;
  duration_seconds?: number;
  distance_meters?: number;
  effort_rpe?: number;
  active_seconds?: number;
  partial?: boolean;
};

/**
 * A command that keeps losing to another device is not going to start winning.
 * Three rebases is generous for a pass being run on a phone and a laptop at
 * once; past that the queue says so rather than spinning.
 */
export const MAX_ATTEMPTS = 3;

export type Resolution =
  | { kind: "resend"; command: QueuedCommand }
  | { kind: "drop"; reason: string };

type Target = { ordinal: number; setIndex: number | null };

function targetOf(
  command: QueuedCommand,
  ordinalOf: (stepId: string) => number | null,
): Target | null {
  if (!command.step_id) return null;
  const ordinal = ordinalOf(command.step_id);
  return ordinal === null ? null : { ordinal, setIndex: command.set_index ?? null };
}

/**
 * Whether the run has already moved past what this command addresses — which is
 * how a set the other device already logged is recognised. Comparing set
 * numbers only within the same step matters: `complete_step` carries no set,
 * and reading its absence as "set 0" would drop a step that is still unfinished.
 */
function isBehind(target: Target, run: TrainingRun, ordinalOf: (stepId: string) => number | null): boolean {
  if (run.current_step_id === null) return false;
  const here = ordinalOf(run.current_step_id);
  if (here === null) return false;
  if (target.ordinal !== here) return target.ordinal < here;
  return target.setIndex !== null && target.setIndex < run.current_set_index;
}

/**
 * What to do with a command the server rejected as stale. The rejection carries
 * the run's real state, so this decides from that rather than from a guess —
 * and it leans on `allowed_actions`, which is the server's own statement of
 * what is legal next, instead of restating the state machine here.
 */
export function resolveConflict(
  command: QueuedCommand,
  current: TrainingRun,
  ordinalOf: (stepId: string) => number | null,
): Resolution {
  if (isFinished(current)) return { kind: "drop", reason: "Passet är redan avslutat." };
  if (!current.allowed_actions.includes(command.action)) {
    return { kind: "drop", reason: "Åtgärden är inte längre tillåten i passets läge." };
  }
  const target = targetOf(command, ordinalOf);
  if (target && isBehind(target, current, ordinalOf)) {
    return { kind: "drop", reason: "Passet har redan passerat det här momentet." };
  }
  if (command.attempts + 1 >= MAX_ATTEMPTS) {
    return { kind: "drop", reason: "Passet ändras från en annan enhet. Kommandot skickades inte." };
  }
  return {
    kind: "resend",
    command: { ...command, expected_version: current.state_version, attempts: command.attempts + 1 },
  };
}

export type SendOutcome =
  | { kind: "sent"; run: TrainingRun }
  | { kind: "conflict"; run: TrainingRun }
  | { kind: "rejected"; message: string }
  | { kind: "offline" };

/**
 * What a failure means for the queue. The distinction that matters is between a
 * command the server will never accept — which has to leave, or it blocks
 * everything behind it forever — and a delivery that simply has not happened
 * yet, which must be kept.
 */
export function classify(error: unknown): SendOutcome {
  const stale = staleRunFrom<TrainingRun>(error);
  if (stale) return { kind: "conflict", run: stale };
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return { kind: "rejected", message: error.message };
  }
  return { kind: "offline" };
}

export type QueueStore = {
  read(): QueuedCommand[];
  write(commands: QueuedCommand[]): void;
};

const STORAGE_KEY = "bal.training.queue";

/**
 * The queue outlives the tab. A pass run with the laptop lid closed between
 * sets must not lose the set that was logged before it closed — and every
 * access is guarded, because a private window throws rather than returning
 * nothing.
 */
export function browserStore(key = STORAGE_KEY): QueueStore {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as QueuedCommand[]) : [];
      } catch {
        return [];
      }
    },
    write(commands) {
      try {
        window.localStorage.setItem(key, JSON.stringify(commands));
      } catch {
        // A queue that cannot be persisted still works for this tab. Losing
        // durability is worse than losing the pass, so it is not an error.
      }
    },
  };
}

export function memoryStore(initial: QueuedCommand[] = []): QueueStore {
  let commands = [...initial];
  return {
    read: () => [...commands],
    write: (next) => { commands = [...next]; },
  };
}

export function sendCommand(command: QueuedCommand): Promise<TrainingRun> {
  const { run_id: runId, attempts: _attempts, ...body } = command;
  return request<TrainingRun>(`/api/v1/training/runs/${runId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type FlushOutcome =
  | { kind: "drained" }
  | { kind: "offline"; pending: number };

export type DroppedCommand = { command: QueuedCommand; reason: string };

/**
 * The client's half of the sync contract (docs/DASHBOARD_LANGUAGE.md's sibling
 * discipline, spelled out in issue #15).
 *
 * The server already guarantees the hard parts: `command_id` makes a resend
 * harmless, and it is checked *before* the version is — so a command that
 * timed out on the way home is answered with its own original result rather
 * than a conflict. What is left to the client is order, and one at a time.
 *
 * [flush] stops rather than retries when delivery fails, and does not schedule
 * anything of its own — the surface owns when to try again (coming back online,
 * a tab regaining focus, the next command). A queue that retried on a timer of
 * its own would keep a dead pass alive in the background long after the tab
 * showing it was forgotten.
 */
export function createRunQueue(options: {
  store: QueueStore;
  ordinalOf: (stepId: string) => number | null;
  send?: (command: QueuedCommand) => Promise<TrainingRun>;
  onRun?: (run: TrainingRun) => void;
  onDropped?: (dropped: DroppedCommand) => void;
}) {
  const send = options.send ?? sendCommand;
  let queue = options.store.read();
  let flushing: Promise<FlushOutcome> | null = null;

  const persist = () => options.store.write(queue);

  const drop = (command: QueuedCommand, reason: string) => {
    options.onDropped?.({ command, reason });
  };

  async function drain(): Promise<FlushOutcome> {
    while (queue.length > 0) {
      const command = queue[0];
      let outcome: SendOutcome;
      try {
        outcome = { kind: "sent", run: await send(command) };
      } catch (error) {
        outcome = classify(error);
      }

      if (outcome.kind === "sent") {
        queue = queue.slice(1);
        persist();
        options.onRun?.(outcome.run);
        continue;
      }

      if (outcome.kind === "conflict") {
        options.onRun?.(outcome.run);
        // Every command behind this one was written against a version that no
        // longer exists either, so a finished run empties the queue rather than
        // failing each command in turn.
        if (isFinished(outcome.run)) {
          for (const pending of queue) drop(pending, "Passet är redan avslutat.");
          queue = [];
          persist();
          return { kind: "drained" };
        }
        const resolution = resolveConflict(command, outcome.run, options.ordinalOf);
        if (resolution.kind === "drop") {
          queue = queue.slice(1);
          drop(command, resolution.reason);
        } else {
          queue = [resolution.command, ...queue.slice(1)];
        }
        persist();
        continue;
      }

      if (outcome.kind === "rejected") {
        queue = queue.slice(1);
        persist();
        drop(command, outcome.message);
        continue;
      }

      // Offline: keep everything, in order, and stop. Trying the next command
      // would deliver it before the one in front of it.
      return { kind: "offline", pending: queue.length };
    }
    return { kind: "drained" };
  }

  return {
    pending: () => [...queue],

    enqueue(
      command: Omit<QueuedCommand, "command_id" | "attempts" | "occurred_at"> & { occurred_at?: string },
    ): QueuedCommand {
      const queued: QueuedCommand = {
        ...command,
        command_id: newCommandId(),
        attempts: 0,
        occurred_at: command.occurred_at ?? new Date().toISOString(),
      };
      queue = [...queue, queued];
      persist();
      return queued;
    },

    /** One flush at a time. A second caller joins the first rather than
     *  starting a parallel drain, which would send two commands at once. */
    flush(): Promise<FlushOutcome> {
      if (!flushing) {
        flushing = drain().finally(() => { flushing = null; });
      }
      return flushing;
    },
  };
}
