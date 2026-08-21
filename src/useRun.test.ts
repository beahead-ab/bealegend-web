import { describe, expect, it } from "vitest";
import { clockText, newerOf, setKey } from "./useRun";
import { isEarlyFinish, type TrainingRun, type TrainingSession } from "./training";

const session = (ids: string[]): TrainingSession => ({
  id: "s1",
  title: "Underkropp A",
  summary: "",
  session_type: "strength",
  execution_mode: "sequential_sets",
  is_extra: false,
  estimated_seconds: null,
  moments: ids.map((id, index) => ({
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
});

const run = (stepId: string | null): TrainingRun => ({
  id: "r1",
  session_id: "s1",
  status: "active",
  started_at: "2026-08-21T16:00:00Z",
  completed_at: null,
  active_seconds: 0,
  current_step_id: stepId,
  current_set_index: 1,
  state_version: 1,
  allowed_actions: ["pause", "complete", "cancel"],
  paused_at: null,
  accumulated_pause_seconds: 0,
});

describe("clockText", () => {
  it("reads a pass the way a pass is read", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(72)).toBe("1:12");
    expect(clockText(2892)).toBe("48:12");
  });

  it("adds the hour only once there is one", () => {
    expect(clockText(3599)).toBe("59:59");
    expect(clockText(3600)).toBe("1:00:00");
  });

  /** The clock counts forward from the server's number. A clock skew that made
   *  it negative should read as a start, not as a minus sign. */
  it("never runs backwards", () => {
    expect(clockText(-30)).toBe("0:00");
  });
});

describe("isEarlyFinish", () => {
  /** Finishing early is saved and counted; cancelling is not. The difference
   *  has to be read off the pass rather than asked of the user twice. */
  it("is early anywhere but the last moment", () => {
    const pass = session(["a", "b", "c"]);

    expect(isEarlyFinish(pass, run("a"))).toBe(true);
    expect(isEarlyFinish(pass, run("b"))).toBe(true);
    expect(isEarlyFinish(pass, run("c"))).toBe(false);
  });

  it("does not call a run early when it cannot tell", () => {
    expect(isEarlyFinish(session(["a"]), run(null))).toBe(false);
    expect(isEarlyFinish(session([]), run("a"))).toBe(false);
  });
});

describe("setKey", () => {
  /** The set a command addresses is a step and an index together. Keying on the
   *  index alone would collide the second set of every moment in the pass. */
  it("names a set by its moment as well as its number", () => {
    expect(setKey("step-a", 2)).not.toBe(setKey("step-b", 2));
  });
});

describe("newerOf", () => {
  const at = (version: number): TrainingRun => ({ ...run("a"), state_version: version });

  /** The rule the stream needs: only it can deliver two readings out of order,
   *  because the queue sends one at a time. */
  it("ignores a reading that overtook a newer one", () => {
    expect(newerOf(at(9), at(7)).state_version).toBe(9);
  });

  it("takes a reading that moves the run forward", () => {
    expect(newerOf(at(7), at(9)).state_version).toBe(9);
  });

  /** Same version, fresher answer — the run itself may still differ, and the
   *  newer answer is the one the server just sent. */
  it("takes the newer answer when the version has not moved", () => {
    const incoming = at(9);

    expect(newerOf(at(9), incoming)).toBe(incoming);
  });

  it("takes anything when there is nothing yet", () => {
    expect(newerOf(null, at(1)).state_version).toBe(1);
  });
});
