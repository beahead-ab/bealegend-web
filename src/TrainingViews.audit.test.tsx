import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SessionView } from "./SessionView";
import { ProgramView } from "./ProgramView";
import { fetchTrainingHome, type TrainingSession, type TrainingRun } from "./training";
import type { RunState } from "./useRun";
import type { useConversation } from "./conversation";

vi.mock("./training", async (original) => ({ ...await original<typeof import("./training")>(), fetchTrainingHome: vi.fn() }));
vi.mock("./useRun", async (original) => ({ ...await original<typeof import("./useRun")>(), useRun: () => state }));
const session: TrainingSession = { id: "s", title: "Styrka", summary: "", session_type: "strength",
  execution_mode: "sequential_sets", is_extra: false, estimated_seconds: 1800, moments: [] };
const conversation: ReturnType<typeof useConversation> = {
  messages: [], draft: "", setDraft: vi.fn(), answering: false, hasMore: false, loadingOlder: false,
  loadOlder: vi.fn(), send: vi.fn(), sendImage: vi.fn(), stageIssueImages: vi.fn(), issueImages: [],
  clearIssueImages: vi.fn(), isIssueDraft: false, finish: vi.fn(), photoError: null,
  canSend: false, isActive: false, lastLine: null,
};
let state: RunState;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state = { run: null, activeSeconds: 0, starting: false, pending: 0, error: "", can: () => false,
    start: vi.fn(), act: vi.fn(), restRemaining: null, startRest: vi.fn(), addRest: vi.fn(), skipRest: vi.fn(),
    logged: {}, logSet: vi.fn() };
  vi.mocked(fetchTrainingHome).mockResolvedValue({ schema_version: "training-home.v1", today_sessions: [session],
    extra_sessions: [], active_run: null, active_session: null,
    assigned_program: { id: "p", title: "Grundstyrka", summary: "", weeks: 4 } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
const click = async (label: string) => {
  const button = buttons().find((element) => element.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
};
const renderSession = async (date: Date, onClose = vi.fn()) => {
  await act(async () => root.render(<SessionView date={date} conversation={conversation} onClose={onClose} onOpenThread={vi.fn()} onOpenProgram={vi.fn()} />));
};

it("starts today's session with one click, but confirms the logging day when viewing another date", async () => {
  await renderSession(new Date());
  await click("Starta passet"); expect(state.start).toHaveBeenCalledTimes(1);
  vi.mocked(state.start).mockClear();
  const otherDay = new Date(); otherDay.setDate(otherDay.getDate() + 1);
  await renderSession(otherDay);
  await click("Starta passet"); expect(state.start).not.toHaveBeenCalled();
  expect(host.textContent).toContain("registreras passet idag");
  await click("Starta och registrera idag"); expect(state.start).toHaveBeenCalledTimes(1);
});

it.each(["discarded", "cancelled"])("renders %s as cast, with a way back but no success receipt", async (status) => {
  state.run = { id: "r", session_id: "s", status, active_seconds: 16, set_results: [] } as unknown as TrainingRun;
  const close = vi.fn();
  await renderSession(new Date(), close);
  expect(host.textContent).toContain("Passet kastades");
  expect(host.textContent).not.toContain("Passet är klart");
  expect(host.textContent).not.toContain("aktiv tid");
  await click("Till översikten"); expect(close).toHaveBeenCalledOnce();
});

it("links the followed program to its existing plan instead of a dead end", async () => {
  const plan = vi.fn();
  await act(async () => root.render(<ProgramView date={new Date()} conversation={conversation}
    onClose={vi.fn()} onOpenThread={vi.fn()} onOpenProgram={vi.fn()} onOpenPlan={plan} />));
  await click("Se planerade pass"); expect(plan).toHaveBeenCalledOnce();
});
