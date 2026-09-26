import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { ProfileView } from "./ProfileView";
import { AccountMenu } from "./TodayView";
import { profileApi, type Profile } from "./profile";
import { prepareAvatar } from "./avatarImage";

vi.mock("./profile", async (original) => ({ ...await original<typeof import("./profile")>(), profileApi: { load: vi.fn(), upload: vi.fn(), remove: vi.fn() } }));
vi.mock("./avatarImage", () => ({ prepareAvatar: vi.fn() }));
const saved: Profile = { fullName: "Test Person", email: "test@example.invalid", avatarUrl: "https://example.invalid/a.jpg?v=1" };
const draft = "data:image/jpeg;base64,AA==";
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  vi.mocked(profileApi.load).mockResolvedValue(saved);
  vi.mocked(profileApi.upload).mockResolvedValue({ ...saved, avatarUrl: "https://example.invalid/a.jpg?v=2" });
  vi.mocked(profileApi.remove).mockResolvedValue({ ...saved, avatarUrl: null });
  vi.mocked(prepareAvatar).mockResolvedValue(draft);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (name: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent === name)!;
const click = async (name: string) => { await act(async () => button(name).click()); };
const render = async (userId: string | undefined = "owner-a") => { await act(async () => root.render(<ProfileView userId={userId} onClose={vi.fn()} floor={<div>Chatten finns kvar</div>} />)); };
const choose = async () => {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "avatar.png", { type: "image/png" })] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
};

describe("profile picture settings", () => {
  it("opens from the single account menu without another header avatar", async () => {
    const open = vi.fn();
    await act(async () => root.render(<AccountMenu name="Test" runActive={false} onSignOut={vi.fn()} openSettings={open} />));
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Konto"]')!.click());
    await click("Inställningar");
    expect(open).toHaveBeenCalledOnce(); expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(host.querySelector("img")).toBeNull();
  });
  it("loads the saved profile, focuses the heading and keeps the chat floor", async () => {
    await render();
    expect(host.textContent).toContain("Test Person"); expect(host.textContent).toContain("Chatten finns kvar");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(saved.avatarUrl);
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(profileApi.upload).not.toHaveBeenCalled();
  });
  it("previews locally; only an explicit save uploads, then uses the confirmed server URL", async () => {
    await render(); await choose();
    expect(host.querySelector("img")?.getAttribute("src")).toBe(draft);
    expect(host.textContent).toContain("inte sparad ännu"); expect(profileApi.upload).not.toHaveBeenCalled();
    expect(button("Hämta profilen igen").disabled).toBe(true);
    await click("Spara bild");
    expect(profileApi.upload).toHaveBeenCalledWith(draft, expect.any(AbortSignal));
    expect(host.textContent).toContain("Profilbilden är sparad.");
    expect(host.querySelector("img")?.getAttribute("src")).toContain("?v=2");
    expect(button("Spara bild")).toBeUndefined();
  });
  it("discards only the local preview", async () => {
    await render(); await choose(); await click("Ångra bildval");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(saved.avatarUrl);
    expect(profileApi.upload).not.toHaveBeenCalled(); expect(profileApi.remove).not.toHaveBeenCalled();
  });
  it("requires confirmation before deleting and shows success only after the server confirms", async () => {
    await render(); await click("Ta bort bild");
    expect(profileApi.remove).not.toHaveBeenCalled();
    await click("Behåll bilden"); expect(profileApi.remove).not.toHaveBeenCalled();
    await click("Ta bort bild"); await click("Ja, ta bort");
    expect(profileApi.remove).toHaveBeenCalledOnce(); expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("Profilbilden är borttagen.");
  });
  it("does not double-submit while saving", async () => {
    let finish!: (profile: Profile) => void;
    vi.mocked(profileApi.upload).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render(); await choose(); await click("Spara bild"); await click("Spara bild");
    expect(button("Spara bild").disabled).toBe(true); expect(profileApi.upload).toHaveBeenCalledOnce();
    await act(async () => finish(saved));
  });
  it("keeps uncertain writes blocked until a fresh server read, with no false success", async () => {
    vi.mocked(profileApi.upload).mockRejectedValue(new ApiError(502, "Profilbilder är inte aktiverade ännu.", "avatar_storage_unavailable"));
    await render(); await choose(); await click("Spara bild");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("inte aktiverade");
    expect(host.textContent).not.toContain("Profilbilden är sparad.");
    expect(button("Spara bild").disabled).toBe(true);
    await click("Ångra bildval"); expect(host.querySelector("img")?.getAttribute("src")).toBe(saved.avatarUrl);
    expect(button("Byt bild").disabled).toBe(true);
    await click("Hämta profilen igen"); expect(button("Byt bild").disabled).toBe(false);
  });
  it("keeps the saved image if deletion cannot be confirmed", async () => {
    vi.mocked(profileApi.remove).mockRejectedValue(new Error("network"));
    await render(); await click("Ta bort bild"); await click("Ja, ta bort");
    expect(host.querySelector("img")?.getAttribute("src")).toBe(saved.avatarUrl);
    expect(host.textContent).not.toContain("Profilbilden är borttagen.");
    expect(button("Ta bort bild").disabled).toBe(true);
  });
  it("offers a fresh read after load failure", async () => {
    vi.mocked(profileApi.load).mockRejectedValueOnce(new Error("network"));
    await render(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')).toBeNull();
    await click("Hämta profilen igen"); expect(host.textContent).toContain("Test Person");
  });
  it("does not post a file that could not be decoded", async () => {
    vi.mocked(prepareAvatar).mockRejectedValue(new Error("Bilden kunde inte läsas."));
    await render(); await choose();
    expect(host.textContent).toContain("Bilden kunde inte läsas."); expect(profileApi.upload).not.toHaveBeenCalled();
  });
  it("drops pending bytes and late results when the account changes", async () => {
    let finish!: (value: string) => void;
    vi.mocked(prepareAvatar).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await render(); await choose();
    const oldSignal = vi.mocked(prepareAvatar).mock.calls[0][1];
    vi.mocked(profileApi.load).mockResolvedValue({ ...saved, fullName: "Another Person", avatarUrl: null });
    await render("owner-b"); await act(async () => finish(draft));
    expect(oldSignal.aborted).toBe(true); expect(host.textContent).toContain("Another Person");
    expect(host.querySelector("img")).toBeNull(); expect(button("Spara bild")).toBeUndefined();
    expect(profileApi.upload).not.toHaveBeenCalled();
  });
  it("aborts in-flight reads on unmount", async () => {
    vi.mocked(profileApi.load).mockReturnValue(new Promise(() => {})); await render();
    const signal = vi.mocked(profileApi.load).mock.calls[0][0]!;
    await act(async () => root.render(null)); expect(signal.aborted).toBe(true);
  });
  it("does not load any profile without an authenticated owner", async () => {
    await act(async () => root.render(<ProfileView onClose={vi.fn()} />));
    expect(profileApi.load).not.toHaveBeenCalled(); expect(host.textContent).toContain("Logga in");
  });
});
