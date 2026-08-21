import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  classify,
  createRunQueue,
  memoryStore,
  resolveConflict,
  MAX_ATTEMPTS,
  type QueuedCommand,
} from "./runQueue";
import { ordinalsFrom, type TrainingRun, type TrainingSession } from "./training";

const session: TrainingSession = {
  id: "s1",
  title: "Underkropp A",
  summary: "",
  session_type: "strength",
  execution_mode: "sequential_sets",
  is_extra: false,
  estimated_seconds: null,
  moments: ["step-a", "step-b", "step-c"].map((id, index) => ({
    id,
    phase: "main",
    position: index + 1,
    block_item_position: 1,
    name: id,
    description: "",
    sets: 3,
    repetitions: 8,
    duration_seconds: null,
    distance_meters: null,
    rest_seconds: 90,
    notes: "",
    prescribed_sets: [],
  })),
};

const ordinalOf = ordinalsFrom(session);

const run = (over: Partial<TrainingRun> = {}): TrainingRun => ({
  id: "r1",
  session_id: "s1",
  status: "active",
  started_at: "2026-08-21T16:00:00Z",
  completed_at: null,
  active_seconds: 600,
  current_step_id: "step-b",
  current_set_index: 2,
  state_version: 7,
  allowed_actions: ["pause", "complete_set", "skip_set", "complete_step", "complete", "cancel"],
  paused_at: null,
  accumulated_pause_seconds: 0,
  ...over,
});

const command = (over: Partial<QueuedCommand> = {}): QueuedCommand => ({
  command_id: "c1",
  run_id: "r1",
  action: "complete_set",
  expected_version: 5,
  occurred_at: "2026-08-21T16:10:00Z",
  device_id: "web",
  device_sequence: 1,
  attempts: 0,
  step_id: "step-b",
  set_index: 2,
  ...over,
});

const conflict = (current: TrainingRun) =>
  new ApiError(409, "Passet har redan uppdaterats på en annan enhet.", "stale_run_version", {
    error: { code: "stale_run_version", message: "…" },
    current_run: current,
  });

describe("classify", () => {
  it("reads the run out of a stale-version rejection", () => {
    const outcome = classify(conflict(run()));

    expect(outcome.kind).toBe("conflict");
    expect(outcome.kind === "conflict" && outcome.run.state_version).toBe(7);
  });

  /** A command the server will never accept has to leave the queue, or it
   *  blocks everything behind it forever. */
  it("treats another client error as the command's own fault", () => {
    expect(classify(new ApiError(400, "Åtgärden är inte tillåten.")).kind).toBe("rejected");
  });

  /** A delivery that has not happened yet must be kept, not discarded. */
  it("treats a server error and a dead network alike as not-yet-delivered", () => {
    expect(classify(new ApiError(503, "Tjänsten svarar inte.")).kind).toBe("offline");
    expect(classify(new TypeError("Failed to fetch")).kind).toBe("offline");
  });
});

describe("resolveConflict", () => {
  it("rebases onto the version the server actually holds", () => {
    const resolution = resolveConflict(command({ set_index: 2 }), run(), ordinalOf);

    expect(resolution.kind).toBe("resend");
    expect(resolution.kind === "resend" && resolution.command.expected_version).toBe(7);
    expect(resolution.kind === "resend" && resolution.command.attempts).toBe(1);
  });

  it("drops everything once the pass is over", () => {
    expect(resolveConflict(command(), run({ status: "completed" }), ordinalOf).kind).toBe("drop");
    expect(resolveConflict(command(), run({ status: "cancelled" }), ordinalOf).kind).toBe("drop");
  });

  /** allowed_actions is the server's own statement of what is legal next, so
   *  the client reads it rather than restating the state machine. */
  it("drops an action the run no longer allows", () => {
    const paused = run({ status: "paused", allowed_actions: ["resume", "complete", "cancel"] });

    expect(resolveConflict(command({ action: "pause" }), paused, ordinalOf).kind).toBe("drop");
    expect(resolveConflict(command({ action: "complete" }), paused, ordinalOf).kind).toBe("resend");
  });

  /** The other device already logged it. Resending would log the set twice —
   *  command_id cannot help, because the two commands are genuinely different. */
  it("drops a set the run has already moved past", () => {
    expect(resolveConflict(command({ step_id: "step-a", set_index: 3 }), run(), ordinalOf).kind).toBe("drop");
    expect(resolveConflict(command({ step_id: "step-b", set_index: 1 }), run(), ordinalOf).kind).toBe("drop");
  });

  it("keeps the set the run is standing on, and the ones after it", () => {
    expect(resolveConflict(command({ step_id: "step-b", set_index: 2 }), run(), ordinalOf).kind).toBe("resend");
    expect(resolveConflict(command({ step_id: "step-b", set_index: 3 }), run(), ordinalOf).kind).toBe("resend");
    expect(resolveConflict(command({ step_id: "step-c", set_index: 1 }), run(), ordinalOf).kind).toBe("resend");
  });

  /**
   * complete_step carries no set index. Reading its absence as "set 0" would
   * drop a step that is still unfinished, every time.
   */
  it("does not read a missing set index as an early one", () => {
    const resolution = resolveConflict(
      command({ action: "complete_step", step_id: "step-b", set_index: undefined }),
      run(),
      ordinalOf,
    );

    expect(resolution.kind).toBe("resend");
  });

  it("gives up on a command that keeps losing", () => {
    const resolution = resolveConflict(command({ attempts: MAX_ATTEMPTS - 1 }), run(), ordinalOf);

    expect(resolution.kind).toBe("drop");
  });

  /** A step from another session, or one this client never loaded. Guessing
   *  would be worse than sending and letting the server judge. */
  it("sends a step it cannot place rather than guessing about it", () => {
    expect(resolveConflict(command({ step_id: "step-unknown" }), run(), ordinalOf).kind).toBe("resend");
  });
});

describe("createRunQueue", () => {
  beforeEach(() => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000000");
  });

  const enqueued = { run_id: "r1", action: "complete_set" as const, expected_version: 5, device_id: "web", device_sequence: 1 };

  it("sends in order, one at a time", async () => {
    const inFlight: string[] = [];
    const seen: number[] = [];
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async (c) => {
        inFlight.push(c.command_id);
        expect(inFlight).toHaveLength(1);
        seen.push(c.set_index!);
        await Promise.resolve();
        inFlight.pop();
        return run();
      },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    queue.enqueue({ ...enqueued, set_index: 2 });
    queue.enqueue({ ...enqueued, set_index: 3 });
    await queue.flush();

    expect(seen).toEqual([1, 2, 3]);
    expect(queue.pending()).toHaveLength(0);
  });

  it("keeps the queue in order when the network dies mid-flush", async () => {
    let calls = 0;
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async () => {
        calls += 1;
        if (calls === 2) throw new TypeError("Failed to fetch");
        return run();
      },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    queue.enqueue({ ...enqueued, set_index: 2 });
    queue.enqueue({ ...enqueued, set_index: 3 });
    const outcome = await queue.flush();

    expect(outcome).toEqual({ kind: "offline", pending: 2 });
    expect(queue.pending().map((c) => c.set_index)).toEqual([2, 3]);
  });

  /** The whole reason the queue is persisted: a laptop lid closed between sets
   *  must not lose the set logged before it closed. */
  it("picks up where a killed tab left off", async () => {
    const store = memoryStore();
    const first = createRunQueue({ store, ordinalOf, send: async () => { throw new TypeError("offline"); } });
    first.enqueue({ ...enqueued, set_index: 1 });
    await first.flush();

    const sent: number[] = [];
    const second = createRunQueue({
      store,
      ordinalOf,
      send: async (c) => { sent.push(c.set_index!); return run(); },
    });
    await second.flush();

    expect(sent).toEqual([1]);
  });

  it("rebases past a conflict and carries on", async () => {
    const versions: number[] = [];
    let thrown = false;
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async (c) => {
        versions.push(c.expected_version);
        if (!thrown) {
          thrown = true;
          throw conflict(run({ state_version: 9 }));
        }
        return run({ state_version: 10 });
      },
    });

    queue.enqueue({ ...enqueued, set_index: 2, step_id: "step-b" });
    const outcome = await queue.flush();

    expect(versions).toEqual([5, 9]);
    expect(outcome).toEqual({ kind: "drained" });
  });

  /** Every command behind this one was written against a version that is gone
   *  too, so the queue empties instead of failing each in turn. */
  it("empties the queue when the pass turns out to be over", async () => {
    const dropped: string[] = [];
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      onDropped: ({ reason }) => dropped.push(reason),
      send: async () => { throw conflict(run({ status: "completed" })); },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    queue.enqueue({ ...enqueued, set_index: 2 });
    await queue.flush();

    expect(queue.pending()).toHaveLength(0);
    expect(dropped).toHaveLength(2);
  });

  it("drops a command the server refuses rather than blocking the ones behind it", async () => {
    const sent: number[] = [];
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async (c) => {
        if (c.set_index === 1) throw new ApiError(400, "Ogiltigt set.");
        sent.push(c.set_index!);
        return run();
      },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    queue.enqueue({ ...enqueued, set_index: 2 });
    await queue.flush();

    expect(sent).toEqual([2]);
    expect(queue.pending()).toHaveLength(0);
  });

  /** Two callers must not start two drains — that would put two commands on the
   *  wire at once, which is the one thing ordering forbids. */
  it("joins a flush already running instead of starting a second", async () => {
    let calls = 0;
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async () => { calls += 1; await Promise.resolve(); return run(); },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    await Promise.all([queue.flush(), queue.flush()]);

    expect(calls).toBe(1);
  });

  /** The realistic case: the next set is logged while the previous one is still
   *  on the wire. It has to land behind it, not race it. */
  it("takes a command added mid-flush without losing its place", async () => {
    const sent: number[] = [];
    let queue: ReturnType<typeof createRunQueue>;
    queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      send: async (c) => {
        sent.push(c.set_index!);
        if (c.set_index === 1) queue.enqueue({ ...enqueued, set_index: 2 });
        await Promise.resolve();
        return run();
      },
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    await queue.flush();

    expect(sent).toEqual([1, 2]);
    expect(queue.pending()).toHaveLength(0);
  });

  it("hands every accepted run back as the new truth", async () => {
    const seen: number[] = [];
    const queue = createRunQueue({
      store: memoryStore(),
      ordinalOf,
      onRun: (r) => seen.push(r.state_version),
      send: async () => run({ state_version: 11 }),
    });

    queue.enqueue({ ...enqueued, set_index: 1 });
    await queue.flush();

    expect(seen).toEqual([11]);
  });

  /** When it happened, not when it was delivered. */
  it("stamps the moment the user acted", () => {
    const queue = createRunQueue({ store: memoryStore(), ordinalOf, send: async () => run() });
    const stamped = queue.enqueue({ ...enqueued, set_index: 1, occurred_at: "2026-08-21T16:10:00Z" });

    expect(stamped.occurred_at).toBe("2026-08-21T16:10:00Z");
  });
});
