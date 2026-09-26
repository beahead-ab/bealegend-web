import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";

type Conversation = ReturnType<typeof useConversation>;
const report = (overrides: Partial<Conversation> = {}): Conversation => ({
  messages: [], draft: "issue: Felet", setDraft: vi.fn(), answering: false,
  hasMore: false, loadingOlder: false, loadOlder: vi.fn(), send: vi.fn(),
  sendImage: vi.fn(), stageIssueImages: vi.fn(), issueImages: [],
  clearIssueImages: vi.fn(), isIssueDraft: true, finish: vi.fn(), photoError: null,
  canSend: true, isActive: false, lastLine: null, ...overrides,
});
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
const render = async (conversation: Conversation) => {
  await act(async () => root.render(<CoachFloor conversation={conversation} onOpenThread={() => undefined} inThread />));
};

describe("bug report composer, iOS issue 121 parity", () => {
  it("keeps the issue hint accessible without a floating text label", async () => {
    await render(report());
    expect(host.textContent).not.toContain("Buggrapport");
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe("Buggrapport");
    expect(host.querySelector(".floor-camera")?.getAttribute("title")).toBe("Välj upp till fyra bilder.");
    expect(host.querySelector(".floor-camera")?.getAttribute("aria-label")).toBe("Bifoga bilder till buggrapporten");
    expect(host.querySelector("input")?.multiple).toBe(true);
    expect(host.querySelector("input")?.hasAttribute("capture")).toBe(false);
  });

  it("contains all four previews and the editor in one panel", async () => {
    await render(report({ issueImages: ["one", "two", "three", "four"] }));
    const panel = host.querySelector(".floor-composer-panel")!;
    expect(panel).not.toBeNull();
    expect(panel.querySelectorAll(".floor-issue-preview img")).toHaveLength(4);
    expect(panel.querySelector("textarea")).not.toBeNull();
    expect(panel.textContent).toContain("4 av 4 bilder");
  });

  it("does not let pending attachments be cleared during submission", async () => {
    const state = report({ issueImages: ["one"], answering: true, canSend: false });
    await render(state);
    const remove = host.querySelector<HTMLButtonElement>(".floor-issue-preview button")!;
    expect(remove.disabled).toBe(true);
    await act(async () => remove.click());
    expect(state.clearIssueImages).not.toHaveBeenCalled();
  });

  it("keeps ordinary camera input and submission working", async () => {
    const state = report({ draft: "Hej", isIssueDraft: false });
    await render(state);
    expect(host.querySelector(".floor-camera")?.getAttribute("aria-label")).toBe("Fotografera eller välj bild");
    expect(host.querySelector("input")?.getAttribute("capture")).toBe("environment");
    expect(host.querySelector("input")?.multiple).toBe(false);
    await act(async () => host.querySelector<HTMLButtonElement>(".floor-send")!.click());
    expect(state.send).toHaveBeenCalledOnce();
  });

  it("removes report decorations after the report is sent", async () => {
    await render(report({ issueImages: ["one"] }));
    await render(report({ draft: "", issueImages: [], isIssueDraft: false, canSend: false }));
    expect(host.querySelector(".floor-issue-preview")).toBeNull();
    expect(host.querySelector("textarea")?.getAttribute("aria-label")).toBe("Meddelande");
    expect(host.textContent).not.toContain("Buggrapport");
  });
});
