import { useEffect } from "react";
import { request } from "./api";

export const FOREGROUND_INTERVAL_MS = 5 * 60 * 1_000;

export type ForegroundEnvironment = {
  isVisible: () => boolean;
  addVisibilityListener: (listener: () => void) => void;
  removeVisibilityListener: (listener: () => void) => void;
  setInterval: (listener: () => void, milliseconds: number) => number;
  clearInterval: (timer: number) => void;
};

const browserEnvironment: ForegroundEnvironment = {
  isVisible: () => document.visibilityState === "visible",
  addVisibilityListener: (listener) => document.addEventListener("visibilitychange", listener),
  removeVisibilityListener: (listener) => document.removeEventListener("visibilitychange", listener),
  setInterval: (listener, milliseconds) => window.setInterval(listener, milliseconds),
  clearInterval: (timer) => window.clearInterval(timer),
};

/**
 * Owns one signed-in browser session's foreground signal.
 *
 * The signal is deliberately tied to actual page visibility rather than to
 * network activity: an open background tab must not keep the coach quiet. A
 * return to the tab is reported immediately, and then at the same five-minute
 * cadence as the native client while the tab remains visible.
 */
export class ForegroundPresenceReporter {
  private started = false;
  private timer: number | null = null;
  private inFlight = false;
  private queued = false;

  constructor(
    private readonly report: () => Promise<unknown>,
    private readonly environment: ForegroundEnvironment = browserEnvironment,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.environment.addVisibilityListener(this.visibilityChanged);
    if (this.environment.isVisible()) this.activate();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.queued = false;
    this.environment.removeVisibilityListener(this.visibilityChanged);
    this.deactivate();
  }

  private readonly visibilityChanged = (): void => {
    if (!this.started) return;
    if (this.environment.isVisible()) this.activate();
    else this.deactivate();
  };

  private activate(): void {
    if (this.timer !== null) return;
    void this.reportNow();
    this.timer = this.environment.setInterval(() => void this.reportNow(), FOREGROUND_INTERVAL_MS);
  }

  private deactivate(): void {
    if (this.timer === null) return;
    this.environment.clearInterval(this.timer);
    this.timer = null;
  }

  private async reportNow(): Promise<void> {
    if (!this.started || !this.environment.isVisible()) return;
    if (this.inFlight) {
      this.queued = true;
      return;
    }

    this.inFlight = true;
    do {
      this.queued = false;
      try {
        await this.report();
      } catch {
        // Presence is a best-effort signal. It must never interrupt the app,
        // and a temporary failure is retried by the next normal interval.
      }
    } while (this.queued && this.started && this.environment.isVisible());
    this.inFlight = false;
  }
}

export function reportForeground(): Promise<void> {
  // `request` includes the HttpOnly web session cookie. The backend's shared
  // session filter turns that cookie into the same authenticated identity the
  // native bearer-token endpoint already uses; JavaScript never handles it.
  return request<void>("/api/v1/presence/foreground", { method: "POST" });
}

export function useForegroundPresence(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const reporter = new ForegroundPresenceReporter(reportForeground);
    reporter.start();
    return () => reporter.stop();
  }, [enabled]);
}
