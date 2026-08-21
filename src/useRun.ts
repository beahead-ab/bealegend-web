import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { newCommandId, request } from "./api";
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
};

export function useRun(session: TrainingSession | null, initial: TrainingRun | null): RunState {
  const [run, setRun] = useState<TrainingRun | null>(initial);
  const [answeredAt, setAnsweredAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");

  const runRef = useRef(run);
  runRef.current = run;

  const sequence = useRef(0);
  const device = useMemo(() => deviceId(), []);

  const adopt = useCallback((next: TrainingRun) => {
    setRun(next);
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

  useEffect(() => {
    if (run?.status !== "active") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [run?.status]);

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

  return { run, activeSeconds, starting, pending, error, can, start, act };
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
