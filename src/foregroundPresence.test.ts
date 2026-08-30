import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FOREGROUND_INTERVAL_MS,
  ForegroundPresenceReporter,
  reportForeground,
  type ForegroundEnvironment,
} from "./foregroundPresence";

afterEach(() => vi.unstubAllGlobals());

function controlledEnvironment() {
  let visible = true;
  let listener: (() => void) | null = null;
  let nextTimer = 1;
  const timers = new Map<number, () => void>();

  const environment: ForegroundEnvironment = {
    isVisible: () => visible,
    addVisibilityListener: (next) => { listener = next; },
    removeVisibilityListener: (current) => {
      if (listener === current) listener = null;
    },
    setInterval: (next, milliseconds) => {
      expect(milliseconds).toBe(FOREGROUND_INTERVAL_MS);
      const id = nextTimer++;
      timers.set(id, next);
      return id;
    },
    clearInterval: (id) => { timers.delete(id); },
  };

  return {
    environment,
    setVisible(next: boolean) {
      visible = next;
      listener?.();
    },
    tick() {
      [...timers.values()].forEach((timer) => timer());
    },
    timerCount: () => timers.size,
    hasListener: () => listener !== null,
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("webbens förgrundssignal", () => {
  it("använder presence-kontraktet med webbens säkra sessionscookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await reportForeground();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/presence\/foreground$/);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(new Headers(init.headers).has("Authorization")).toBe(false);
  });

  it("rapporterar direkt och därefter var femte minut medan sidan syns", async () => {
    const browser = controlledEnvironment();
    const report = vi.fn().mockResolvedValue(undefined);
    const reporter = new ForegroundPresenceReporter(report, browser.environment);

    reporter.start();
    await settle();
    expect(report).toHaveBeenCalledTimes(1);
    expect(browser.timerCount()).toBe(1);

    browser.tick();
    await settle();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("stannar i bakgrunden och rapporterar direkt när sidan blir synlig igen", async () => {
    const browser = controlledEnvironment();
    const report = vi.fn().mockResolvedValue(undefined);
    const reporter = new ForegroundPresenceReporter(report, browser.environment);

    reporter.start();
    await settle();
    browser.setVisible(false);
    expect(browser.timerCount()).toBe(0);

    browser.tick();
    await settle();
    expect(report).toHaveBeenCalledTimes(1);

    browser.setVisible(true);
    await settle();
    expect(report).toHaveBeenCalledTimes(2);
    expect(browser.timerCount()).toBe(1);
  });

  it("tar bort både lyssnare och intervall när sessionen avslutas", async () => {
    const browser = controlledEnvironment();
    const report = vi.fn().mockResolvedValue(undefined);
    const reporter = new ForegroundPresenceReporter(report, browser.environment);

    reporter.start();
    await settle();
    reporter.stop();

    expect(browser.hasListener()).toBe(false);
    expect(browser.timerCount()).toBe(0);
    browser.tick();
    browser.setVisible(false);
    browser.setVisible(true);
    await settle();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("låter ett tillfälligt nätfel vara tyst och fortsätter vid nästa intervall", async () => {
    const browser = controlledEnvironment();
    const report = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const reporter = new ForegroundPresenceReporter(report, browser.environment);

    reporter.start();
    await settle();
    expect(report).toHaveBeenCalledTimes(1);

    browser.tick();
    await settle();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it("startar inte flera intervall för samma session", async () => {
    const browser = controlledEnvironment();
    const report = vi.fn().mockResolvedValue(undefined);
    const reporter = new ForegroundPresenceReporter(report, browser.environment);

    reporter.start();
    reporter.start();
    await settle();

    expect(report).toHaveBeenCalledTimes(1);
    expect(browser.timerCount()).toBe(1);
  });
});
