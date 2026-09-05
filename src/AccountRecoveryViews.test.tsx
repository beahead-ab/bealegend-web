// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetPasswordView } from "./AccountRecoveryViews";
import { auth } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("SetPasswordView", () => {
  it("öppnar begäran om en ny länk när återställningslänken är ogiltig", async () => {
    vi.spyOn(auth, "passwordToken").mockResolvedValue({ valid: false });
    const onDone = vi.fn();
    const onRequestNew = vi.fn();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <SetPasswordView token="utgången" onDone={onDone} onRequestNew={onRequestNew} />,
      );
    });

    const button = Array.from(host.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Begär en ny länk",
    );
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onRequestNew).toHaveBeenCalledOnce();
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    host.remove();
  });
});
