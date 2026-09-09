import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, auth, request } from "./api";
import { useSession } from "./session";
import { useRun, type RunState } from "./useRun";
import { type QueuedCommand } from "./runQueue";
import { type TrainingRun, type TrainingSession } from "./training";

vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), request: vi.fn() }));

const session: TrainingSession = {
  id: "session-current", title: "Pass", summary: "", session_type: "strength", execution_mode: "sequential_sets",
  is_extra: false, estimated_seconds: null, moments: [],
};
const run = (id: string, version = 1): TrainingRun => ({
  id, session_id: session.id, status: "active", started_at: "2026-09-09T00:00:00Z", completed_at: null,
  active_seconds: 0, current_step_id: null, current_set_index: 1, state_version: version,
  allowed_actions: ["pause", "complete", "cancel"], paused_at: null, accumulated_pause_seconds: 0,
});
const queued = (id: string): QueuedCommand => ({
  command_id: `command-${id}`, run_id: id, action: "complete", expected_version: 1,
  occurred_at: "2026-09-09T00:00:00Z", device_id: "web-test", device_sequence: 1, attempts: 0,
});
class Source {
  static instances: Source[] = [];
  listener?: EventListener;
  constructor(readonly url: string) { Source.instances.push(this); }
  addEventListener(_type: string, listener: EventListener) { this.listener = listener; }
  close() { /* Retain callback so the test can inject an already-dispatched late frame. */ }
  emit(value: TrainingRun) { this.listener?.(new MessageEvent("run_updated", { data: JSON.stringify(value) })); }
}
let host: HTMLDivElement;
let root: Root;
let current: RunState;
let currentSession: ReturnType<typeof useSession>;
function SessionProbe() {
  currentSession = useSession();
  return currentSession.session.status === "signedIn"
    ? <Probe initial={run("current")} />
    : <div>{currentSession.session.status}</div>;
}
function Probe({ initial }: { initial: TrainingRun | null }) {
  current = useRun(session, initial);
  return <div>{current.run?.id ?? "no-run"} / {current.pending} / {current.error}</div>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", Source);
  Source.instances = [];
  localStorage.clear();
  vi.mocked(request).mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("real useRun with persisted commands and delayed run answers", () => {
  it("unknown session does not mount the run queue; confirmed retry keeps a 429 pending", async () => {
    const command = queued("current");
    localStorage.setItem("bal.training.queue", JSON.stringify([command]));
    vi.spyOn(auth, "refresh").mockRejectedValueOnce(new ApiError(503, "offline"))
      .mockResolvedValueOnce({ authenticated: true, user: { id: "A" } });
    vi.mocked(request).mockRejectedValueOnce(new ApiError(429, "senare"));
    await act(async () => root.render(<SessionProbe />));
    expect(currentSession.session.status).toBe("restoreFailed");
    expect(request).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("bal.training.queue")!)).toEqual([command]);
    await act(async () => currentSession.retryRestore());
    expect(request).toHaveBeenCalledOnce();
    expect(current.pending).toBe(1);
    expect(current.run?.id).toBe("current");
    const retained = JSON.parse(localStorage.getItem("bal.training.queue")!)[0];
    expect(retained.command_id).toBe(command.command_id);
    expect(retained.occurred_at).toBe(command.occurred_at);
    vi.mocked(request).mockResolvedValueOnce(run("current", 2));
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(current.pending).toBe(0);
    expect(current.run?.state_version).toBe(2);
  });

  it.each(["current", null])("does not select an old queued run when selected run is %s", async (selected) => {
    localStorage.setItem("bal.training.queue", JSON.stringify([queued("old")]));
    vi.mocked(request).mockResolvedValue(run("old", 90));
    await act(async () => root.render(<Probe initial={selected ? run(selected) : null} />));
    expect(current.run?.id ?? null).toBe(selected);
    expect(JSON.parse(localStorage.getItem("bal.training.queue")!)).toEqual([]);
  });

  it("shows a conflict pause as pending, not delivered", async () => {
    localStorage.setItem("bal.training.queue", JSON.stringify([queued("current")]));
    vi.mocked(request).mockRejectedValue(new ApiError(409, "ändrat", "stale_run_version", { current_run: run("current", 8) }));
    await act(async () => root.render(<Probe initial={run("current")} />));
    expect(request).toHaveBeenCalledTimes(3);
    expect(current.pending).toBe(1);
    expect(current.error).toContain("ligger kvar");
    expect(current.run?.state_version).toBe(8);
    vi.mocked(request).mockResolvedValue(run("current", 9));
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(current.pending).toBe(0);
    expect(current.run?.state_version).toBe(9);
  });

  it("ignores another run in an SSE frame", async () => {
    await act(async () => root.render(<Probe initial={run("current")} />));
    await act(async () => Source.instances[0].emit(run("old", 90)));
    expect(current.run?.id).toBe("current");
    expect(current.run?.state_version).toBe(1);
    await act(async () => Source.instances[0].emit(run("current", 2)));
    expect(current.run?.state_version).toBe(2);
  });

  it("explicit start selects a new run and late old frames cannot restore the previous one", async () => {
    await act(async () => root.render(<Probe initial={{ ...run("old", 90), status: "paused" }} />));
    const oldStream = Source.instances[0];
    vi.mocked(request).mockResolvedValue(run("new", 1));
    await act(async () => current.start());
    expect(current.run?.id).toBe("new");
    await act(async () => oldStream.emit(run("old", 99)));
    expect(current.run?.id).toBe("new");
    expect(current.run?.state_version).toBe(1);
  });
});
