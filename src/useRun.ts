import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_URL, newCommandId, request } from "./api";
import {
  browserStore,
  createRunQueue,
  type QueuedCommand,
} from "./runQueue";
import {
  isFinished,
  ordinalsFrom,
  type RunAction,
  type TrainingRun,
  type TrainingSession,
} from "./training";

/**
 * Which device the commands came from. Stable for the browser rather than for
 * the tab: `device_sequence` is per device, and two tabs claiming one identity
 * with two counters would make the diagnostics lie about gaps that never were.
 */
const DEVICE_KEY = "bal.device.id";

export function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = `web-${newCommandId()}`;
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // A private window gets a fresh identity per load. The sequence is
    // diagnostic only, so this costs nothing that matters.
    return `web-${newCommandId()}`;
  }
}

function startRun(sessionId: string): Promise<TrainingRun> {
  return request<TrainingRun>("/api/v1/training/runs", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      // Idempotent on the server, so a start that times out and is tried again
      // resumes the same run instead of being refused as a second one.
      client_request_id: newCommandId(),
      started_at: new Date().toISOString(),
      source_device: "web",
    }),
  });
}

/** What this client logged during this session, for marking the sets it knows
 *  about. The run itself carries only counts, never a per-set list. */
export type LoggedSet = {
  status: "completed" | "skipped";
  repetitions: number | null;
  weightKg: number | null;
};

export function setKey(stepId: string, setIndex: number): string {
  return `${stepId}:${setIndex}`;
}

export type RunState = {
  run: TrainingRun | null;
  /** The clock as it should read now — the server's number, carried forward
   *  between answers so the seconds do not stand still between commands. */
  activeSeconds: number;
  starting: boolean;
  pending: number;
  error: string;
  can: (action: RunAction) => boolean;
  start: () => Promise<void>;
  act: (action: RunAction, extra?: Partial<QueuedCommand>) => void;
  /** Seconds left of the rest, 0 while the "done" chip still shows, null when
   *  no rest is running. */
  restRemaining: number | null;
  startRest: (seconds: number) => void;
  addRest: (seconds: number) => void;
  skipRest: () => void;
  logged: Record<string, LoggedSet>;
  logSet: (
    action: "complete_set" | "skip_set",
    stepId: string,
    setIndex: number,
    values?: { repetitions?: number | null; weightKg?: number | null; effortRpe?: number | null },
  ) => void;
};

export function useRun(session: TrainingSession | null, initial: TrainingRun | null): RunState {
  const [run, setRun] = useState<TrainingRun | null>(initial);
  const [answeredAt, setAnsweredAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [logged, setLogged] = useState<Record<string, LoggedSet>>({});
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);

  const runRef = useRef(run);
  runRef.current = run;

  const sequence = useRef(0);
  const device = useMemo(() => deviceId(), []);

  const adopt = useCallback((next: TrainingRun) => {
    setRun((current) => newerOf(current, next));
    setAnsweredAt(Date.now());
    setNow(Date.now());
  }, []);

  // Held in a ref so the queue survives a re-render while still reading the
  // current session's ordering — the queue must not be rebuilt underneath
  // commands it is in the middle of sending.
  const ordinals = useRef<(stepId: string) => number | null>(() => null);
  ordinals.current = useMemo(() => (session ? ordinalsFrom(session) : () => null), [session]);

  const queue = useMemo(
    () =>
      createRunQueue({
        store: browserStore(),
        ordinalOf: (stepId) => ordinals.current(stepId),
        onRun: adopt,
        onDropped: ({ reason }) => setError(reason),
      }),
    [adopt],
  );

  const flush = useCallback(async () => {
    const outcome = await queue.flush();
    setPending(outcome.kind === "offline" ? outcome.pending : 0);
  }, [queue]);

  // The queue schedules nothing of its own, so this is where trying again lives:
  // the moments something actually changed, rather than a timer that would keep
  // a forgotten tab talking about a pass nobody is running.
  useEffect(() => {
    const retry = () => { void flush(); };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    void flush();
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [flush]);

  // Ticks for the pass clock and for the rest countdown alike. The rest has to
  // keep running while the pass is paused — pausing is what you do *during* a
  // rest that ran long, and stopping the count then would hide the reason.
  useEffect(() => {
    if (run?.status !== "active" && rest === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run?.status, rest]);

  /**
   * The other device. A pass started on the phone shows here without anyone
   * pressing refresh — the run's own stream, which is a plain GET, so unlike
   * the chat stream it can be an EventSource. The session is a first-party
   * cookie (the web is served from the same origin as the API), and the
   * server's filter lifts it into the header, so no token is handled here.
   *
   * A version older than the one held is ignored inside [adopt]; a command
   * already queued against an older version is not — it goes to the server and
   * is answered with a conflict, which is the one place that decision belongs.
   */
  const runId = run && !isFinished(run) ? run.id : null;
  useEffect(() => {
    if (!runId) return;
    const source = new EventSource(`${API_URL}/api/v1/training/runs/${runId}/stream`, {
      withCredentials: true,
    });
    source.addEventListener("run_updated", (event) => {
      try {
        adopt(JSON.parse((event as MessageEvent).data) as TrainingRun);
      } catch {
        // A frame that is not a run is not worth breaking the pass over.
      }
    });
    return () => source.close();
  }, [runId, adopt]);

  const activeSeconds = run
    ? run.status === "active"
      ? run.active_seconds + Math.max(0, Math.floor((now - answeredAt) / 1000))
      : run.active_seconds
    : 0;

  const start = useCallback(async () => {
    if (!session || starting) return;
    setStarting(true);
    setError("");
    try {
      adopt(await startRun(session.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Passet kunde inte startas.");
    } finally {
      setStarting(false);
    }
  }, [session, starting, adopt]);

  const act = useCallback(
    (action: RunAction, extra: Partial<QueuedCommand> = {}) => {
      const current = runRef.current;
      if (!current) return;
      setError("");
      sequence.current += 1;
      queue.enqueue({
        run_id: current.id,
        action,
        expected_version: current.state_version,
        device_id: device,
        device_sequence: sequence.current,
        active_seconds: activeSeconds,
        ...extra,
      });
      void flush();
    },
    [queue, flush, device, activeSeconds],
  );

  /**
   * What the pass allows right now, straight from the server. The client never
   * decides this — a button drawn from a rule written here would disagree with
   * the server the first time the rule changed on one side only.
   */
  const can = useCallback(
    (action: RunAction) => !!run && !isFinished(run) && run.allowed_actions.includes(action),
    [run],
  );

  /**
   * The rest between sets — the one number you actually look at mid-pass, and
   * the only reason to have the phone in your hand between them. Entirely
   * client-side: no command, no contract, nothing to sync.
   *
   * Silent by design. No sound and no vibration, because a gym is not a place
   * to be startled by a phone you put down on a bench.
   */
  const startRest = useCallback((seconds: number) => {
    if (seconds <= 0) {
      setRest(null);
      return;
    }
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
    setNow(Date.now());
  }, []);

  const addRest = useCallback((seconds: number) => {
    setRest((current) => (current ? { ...current, endsAt: current.endsAt + seconds * 1000 } : current));
  }, []);

  const skipRest = useCallback(() => setRest(null), []);

  const restRemaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : null;

  const logSet = useCallback<RunState["logSet"]>(
    (action, stepId, setIndex, values = {}) => {
      setLogged((previous) => ({
        ...previous,
        [setKey(stepId, setIndex)]: {
          status: action === "skip_set" ? "skipped" : "completed",
          repetitions: values.repetitions ?? null,
          weightKg: values.weightKg ?? null,
        },
      }));
      act(action, {
        // Always named, never left to default to "whatever is current". A
        // command that waited out a tunnel would otherwise land against the set
        // the run had moved on to, and log the wrong one.
        step_id: stepId,
        set_index: setIndex,
        ...(values.repetitions != null ? { repetitions: values.repetitions } : {}),
        // Sent only when the user changed it. Left out, the server records the
        // weight it froze when the run started — which is the number the user
        // actually saw, and safer than echoing a suggestion that may have been
        // recomputed since.
        ...(values.weightKg != null ? { weight_kg: values.weightKg } : {}),
        ...(values.effortRpe != null ? { effort_rpe: values.effortRpe } : {}),
      });
    },
    [act],
  );

  return {
    run, activeSeconds, starting, pending, error, can, start, act, logged, logSet,
    restRemaining, startRest, addRest, skipRest,
  };
}

/**
 * Which of two readings of the same run to keep. The server's version only ever
 * climbs, so a lower one arriving is a message that overtook a newer one on the
 * way here — and applying it would rewind the surface to a state already left.
 * Only the stream can deliver these out of order; the queue sends one at a time.
 */
export function newerOf(current: TrainingRun | null, next: TrainingRun): TrainingRun {
  return current && next.state_version < current.state_version ? current : next;
}

/** The clock, as a pass is read: 48:12 rather than 2892 seconds. */
export function clockText(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
