import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CoachThread } from "./CoachThread";
import type { useConversation } from "./conversation";

type Conversation = ReturnType<typeof useConversation>;
const message = (id: string) => ({ id, role: "user" as const, text: id, attachmentUrl: null,
  attachmentUrls: [], attachmentMealId: null, actions: [], streaming: false, failed: false,
  createdAt: new Date("2026-09-27T09:00:00Z") });
const conversation = (ids: string[]): Conversation => ({
  messages: ids.map(message), draft: "", setDraft: vi.fn(), answering: false,
  hasMore: true, loadingOlder: false, loadOlder: vi.fn(), send: vi.fn(), sendImage: vi.fn(),
  stageIssueImages: vi.fn(), issueImages: [], clearIssueImages: vi.fn(), isIssueDraft: false,
  finish: vi.fn(), photoError: null, canSend: false, isActive: false, lastLine: null,
});
let host: HTMLDivElement;
let root: Root;
let height: number;
let top: number;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  height = 1200; top = 0;
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("thread-scroll") ? height : 40;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "scrollTop", "get").mockImplementation(() => top);
  vi.spyOn(HTMLElement.prototype, "scrollTop", "set").mockImplementation((value) => { top = Math.min(Math.max(0, value), height - 400); });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const render = async (ids: string[], open = true) => {
  await act(async () => root.render(<CoachThread conversation={conversation(ids)} onClose={() => undefined} open={open} />));
};
const scrollTo = async (value: number) => {
  top = value;
  await act(async () => host.querySelector(".thread-scroll")!.dispatchEvent(new Event("scroll", { bubbles: true })));
};

it("opens at the newest message, also when history arrives after opening", async () => {
  await render([]); expect(top).toBe(0);
  await render(["a", "b"]); expect(top).toBe(800);
  height = 1800;
  await render(["a", "b", "c"]); expect(top).toBe(1400);
});

it("does not drag a reader to streamed messages, and keeps the viewport when older history is prepended", async () => {
  await render(["a", "b"]);
  await scrollTo(200);
  height = 1300;
  await render(["a", "b", "c"]); expect(top).toBe(200);
  height = 1800;
  await render(["older", "a", "b", "c"]); expect(top).toBe(700);
  await render(["older", "a", "b", "c"], false);
  height = 1900;
  await render(["older", "a", "b", "c", "d"], false); expect(top).toBe(700);
  await render(["older", "a", "b", "c", "d"], true); expect(top).toBe(700);
  await act(async () => host.querySelector<HTMLButtonElement>(".thread-catchup")!.click());
  expect(top).toBe(1500);
});

it("does not position a hidden thread before its first actual opening", async () => {
  await render(["a", "b"], false); expect(top).toBe(0);
  await render(["a", "b"], true); expect(top).toBe(800);
});
