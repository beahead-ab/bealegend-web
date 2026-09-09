import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, auth } from "./api";
import { App } from "./App";
import { useSession } from "./session";

vi.mock("./TodayView", () => ({ TodayView: ({ user }: { user?: { id: string } }) => <div>Dag för {user?.id}</div> }));
vi.mock("./foregroundPresence", () => ({ useForegroundPresence: () => undefined }));

const cached = JSON.stringify({ userId: "A", days: {} });
const signedIn = (id: string) => ({ authenticated: true, user: { id } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let host: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useSession>;
function Probe() { current = useSession(); return null; }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("bal.days", cached);
  history.replaceState({}, "", "/");
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

describe("återställning utan obekräftad utloggning", () => {
  it.each([
    ["503", new ApiError(503, "serverfel")],
    ["429", new ApiError(429, "överbelastad")],
    ["nätavbrott", new TypeError("offline")],
  ])("behåller ägd cache men visar inte kontot vid %s", async (_label, error) => {
    vi.spyOn(auth, "refresh").mockRejectedValue(error);
    await act(async () => root.render(<Probe />));
    expect(current.session.status).toBe("restoreFailed");
    expect(localStorage.getItem("bal.days")).toBe(cached);
    expect(current.session).not.toHaveProperty("user");
  });

  it("bekräftad 401 glömmer cachen och visar utloggad", async () => {
    vi.spyOn(auth, "refresh").mockRejectedValue(new ApiError(401, "expired"));
    await act(async () => root.render(<Probe />));
    expect(current.session.status).toBe("signedOut");
    expect(localStorage.getItem("bal.days")).toBeNull();
  });

  it.each(["A", "B"])("återförsöket bekräftar %s innan dess data blir läsbar", async (id) => {
    const refresh = vi.spyOn(auth, "refresh").mockRejectedValueOnce(new ApiError(503, "offline"));
    await act(async () => root.render(<Probe />));
    refresh.mockResolvedValueOnce(signedIn(id));
    await act(async () => current.retryRestore());
    expect(current.session).toEqual({ status: "signedIn", user: { id } });
    expect(localStorage.getItem("bal.days")).toBe(id === "A" ? cached : null);
  });

  it("ett lyckat HTTP-svar utan bekräftad identitet visar inte en dag", async () => {
    vi.spyOn(auth, "refresh").mockResolvedValue({ authenticated: true });
    await act(async () => root.render(<Probe />));
    expect(current.session.status).toBe("restoreFailed");
    expect(localStorage.getItem("bal.days")).toBe(cached);
  });

  it("serverns uttryckliga authenticated=false avslutar sessionen", async () => {
    vi.spyOn(auth, "refresh").mockResolvedValue({ authenticated: false });
    await act(async () => root.render(<Probe />));
    expect(current.session.status).toBe("signedOut");
    expect(localStorage.getItem("bal.days")).toBeNull();
  });

  it("utloggning döljer data omedelbart även om servern inte svarar", async () => {
    const logout = deferred<{ authenticated: boolean }>();
    vi.spyOn(auth, "refresh").mockResolvedValue(signedIn("A"));
    vi.spyOn(auth, "signOut").mockReturnValue(logout.promise);
    await act(async () => root.render(<Probe />));
    let pending!: Promise<void>;
    await act(async () => { pending = current.signOut(); });
    expect(current.session.status).toBe("signedOut");
    expect(localStorage.getItem("bal.days")).toBeNull();
    await act(async () => { logout.reject(new TypeError("offline")); await pending; });
    expect(current.session.status).toBe("signedOut");
  });

  it.each(["success", "401"])("ignorerar gammalt restore-%s efter en ny B-inloggning", async (result) => {
    const restore = deferred<Awaited<ReturnType<typeof auth.refresh>>>();
    vi.spyOn(auth, "refresh").mockReturnValue(restore.promise);
    vi.spyOn(auth, "signIn").mockResolvedValue(signedIn("B"));
    await act(async () => root.render(<Probe />));
    await act(async () => current.signIn("b@example.invalid", "test-only"));
    const bCache = JSON.stringify({ userId: "B", days: {} });
    localStorage.setItem("bal.days", bCache);
    await act(async () => {
      if (result === "success") restore.resolve(signedIn("A"));
      else restore.reject(new ApiError(401, "old token"));
    });
    expect(current.session).toEqual({ status: "signedIn", user: { id: "B" } });
    expect(localStorage.getItem("bal.days")).toBe(bCache);
  });

  it("ett sent återförsök kan inte återlägga en utloggad session", async () => {
    const retry = deferred<Awaited<ReturnType<typeof auth.refresh>>>();
    vi.spyOn(auth, "refresh").mockRejectedValueOnce(new ApiError(503, "offline")).mockReturnValueOnce(retry.promise);
    vi.spyOn(auth, "signOut").mockResolvedValue({ authenticated: false });
    await act(async () => root.render(<Probe />));
    let pending!: Promise<void>;
    await act(async () => { pending = current.retryRestore(); });
    await act(async () => current.signOut());
    await act(async () => { retry.resolve(signedIn("A")); await pending; });
    expect(current.session.status).toBe("signedOut");
    expect(localStorage.getItem("bal.days")).toBeNull();
  });

  it("ett gammalt logout-svar kan inte radera ny B-session", async () => {
    const logout = deferred<{ authenticated: boolean }>();
    vi.spyOn(auth, "refresh").mockResolvedValue(signedIn("A"));
    vi.spyOn(auth, "signOut").mockReturnValue(logout.promise);
    vi.spyOn(auth, "signIn").mockResolvedValue(signedIn("B"));
    await act(async () => root.render(<Probe />));
    let pending!: Promise<void>;
    await act(async () => { pending = current.signOut(); });
    await act(async () => current.signIn("b@example.invalid", "test-only"));
    await act(async () => { logout.resolve({ authenticated: false }); await pending; });
    expect(current.session).toEqual({ status: "signedIn", user: { id: "B" } });
  });
});

describe("verklig app vid tillfälligt återställningsfel", () => {
  it("visar återförsök i stället för lösenordsformulär eller cachad dag", async () => {
    const retry = deferred<Awaited<ReturnType<typeof auth.refresh>>>();
    vi.spyOn(auth, "refresh").mockRejectedValueOnce(new ApiError(503, "offline")).mockReturnValueOnce(retry.promise);
    await act(async () => root.render(<App />));
    expect(host.textContent).toContain("Kan inte kontrollera din inloggning just nu");
    expect(host.querySelector('input[type="password"]')).toBeNull();
    expect(host.textContent).not.toContain("Dag för");
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Försök igen")!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(host.textContent).toContain("Hämtar din session");
    await act(async () => retry.resolve(signedIn("B")));
    expect(host.textContent).toContain("Dag för B");
    expect(localStorage.getItem("bal.days")).toBeNull();
  });

  it("låter användaren uttryckligen logga ut från återförsöksläget", async () => {
    vi.spyOn(auth, "refresh").mockRejectedValue(new ApiError(503, "offline"));
    vi.spyOn(auth, "signOut").mockRejectedValue(new TypeError("offline"));
    await act(async () => root.render(<App />));
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Logga ut")!;
    expect(button).toBeDefined();
    await act(async () => button.click());
    expect(host.querySelector('input[type="password"]')).not.toBeNull();
    expect(localStorage.getItem("bal.days")).toBeNull();
  });
});
