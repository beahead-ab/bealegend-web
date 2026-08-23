import type { DailyOverview } from "./daily";

/**
 * The last day the server actually answered with, kept so a lost connection
 * costs freshness rather than the whole surface.
 *
 * The rule from the design target is short: never an empty page. A day that was
 * true at 07:12 is still worth reading at 11:00 in a basement gym — as long as
 * the surface says which one it is showing. It never pretends to be current,
 * and it is never written from anything but a real answer.
 */
export type Remembered = { at: number; overview: DailyOverview };

type Store = {
  read(): Record<string, Remembered>;
  write(days: Record<string, Remembered>): void;
  clear(): void;
};

const STORAGE_KEY = "bal.days";

/**
 * Seven days. The surface can page backwards indefinitely, and a cache that
 * grows with every visited day would fill the origin's quota with old numbers
 * nobody is going to read offline. A week covers the days a person actually
 * pages between.
 */
const KEEP_DAYS = 7;

/** Same guarding as the run queue: a private window throws on access rather
 *  than returning nothing, and a surface that cannot remember still works. */
export function browserStore(key = STORAGE_KEY): Store {
  return {
    read() {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? (parsed as Record<string, Remembered>) : {};
      } catch {
        return {};
      }
    },
    write(days) {
      try {
        window.localStorage.setItem(key, JSON.stringify(days));
      } catch {
        // Out of quota, or a window that refuses storage. Losing the memory is
        // not worth failing a page that otherwise works.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Nothing to do, and nothing worth telling the user about.
      }
    },
  };
}

export function memoryStore(initial: Record<string, Remembered> = {}): Store {
  let days = { ...initial };
  return {
    read: () => ({ ...days }),
    write: (next) => { days = { ...next }; },
    clear: () => { days = {}; },
  };
}

export function remember(
  iso: string,
  overview: DailyOverview,
  now: number = Date.now(),
  store: Store = browserStore(),
): void {
  const days = { ...store.read(), [iso]: { at: now, overview } };
  // Newest first by the day they describe, not by when they were fetched: a
  // refresh of an old day should not push out the ones around today.
  const keep = Object.keys(days).sort().reverse().slice(0, KEEP_DAYS);
  store.write(Object.fromEntries(keep.map((day) => [day, days[day]])));
}

export function recall(iso: string, store: Store = browserStore()): Remembered | null {
  const entry = store.read()[iso];
  // A stored shape from an older build is not worth guessing at.
  return entry && entry.overview && typeof entry.at === "number" ? entry : null;
}

/** Signing out ends the account's presence in this browser. Days measured by
 *  one person must not still be readable by whoever signs in next. */
export function forget(store: Store = browserStore()): void {
  store.clear();
}

/**
 * When the day on screen was fetched, said the way a person would.
 *
 * Same day: the clock is enough. Another day: the clock alone would read as
 * this morning, which is the one thing the line exists to prevent.
 */
export function fetchedLabel(at: number, now: number = Date.now()): string {
  const then = new Date(at);
  const clock = then.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (then.toDateString() === new Date(now).toDateString()) return `Senast hämtat ${clock}`;
  const day = then.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return `Senast hämtat ${day} ${clock}`;
}
