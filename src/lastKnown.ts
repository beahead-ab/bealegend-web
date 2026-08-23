import type { DashboardConfig } from "./dashboard";
import type { DailyOverview } from "./daily";

/**
 * What the server last answered with, kept so a lost connection costs freshness
 * rather than the whole surface.
 *
 * The rule from the design target is short: never an empty page. A day that was
 * true at 07:12 is still worth reading at 11:00 in a basement gym — as long as
 * the surface says which one it is showing. It never pretends to be current,
 * and it is never written from anything but a real answer.
 *
 * **Everything here belongs to exactly one account.** These are somebody's
 * meals, weight and sleep, sitting in a browser other people may also use. The
 * store therefore holds the account it belongs to, every read and write names
 * the account it expects, and a mismatch does not merely miss — it wipes. That
 * is deliberately stricter than needed: signing out already clears, and this is
 * what still holds if some future path forgets to.
 */
export type Remembered = { at: number; overview: DailyOverview };

type Cache = {
  /** Whose measurements these are. Nothing is readable without matching it. */
  userId: string;
  /** Keyed by the ISO date the day describes. */
  days: Record<string, Remembered>;
  /** The surface's own shape, so an offline day looks like the user's own
   *  dashboard rather than falling back to the built-in one. */
  config?: { at: number; config: DashboardConfig };
};

type Store = {
  read(): Cache | null;
  write(cache: Cache): void;
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
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // A shape from an older build is not worth guessing at, and one
        // without an owner is not worth reading at all.
        if (!parsed || typeof parsed !== "object") return null;
        if (typeof parsed.userId !== "string" || !parsed.userId) return null;
        if (!parsed.days || typeof parsed.days !== "object") return null;
        return parsed as Cache;
      } catch {
        return null;
      }
    },
    write(cache) {
      try {
        window.localStorage.setItem(key, JSON.stringify(cache));
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

export function memoryStore(initial: Cache | null = null): Store {
  let cache = initial;
  return {
    read: () => (cache ? { ...cache, days: { ...cache.days } } : null),
    write: (next) => { cache = { ...next, days: { ...next.days } }; },
    clear: () => { cache = null; },
  };
}

/**
 * The store as this account may see it, or null when it belongs to somebody
 * else — and in that case it is wiped on the way out.
 *
 * Wiping on a mismatched read rather than merely declining is the point: the
 * next person to sign in on this machine takes the first read, and by the time
 * they have a surface the previous account's day is already gone.
 */
function mine(userId: string, store: Store): Cache | null {
  const cache = store.read();
  if (!cache) return null;
  if (cache.userId !== userId) {
    store.clear();
    return null;
  }
  return cache;
}

/**
 * Called when an account takes over this browser. Clears anything belonging to
 * somebody else before the new session can read or write a single day.
 */
export function claim(userId: string, store: Store = browserStore()): void {
  const cache = store.read();
  if (cache && cache.userId !== userId) store.clear();
}

/** Signing out — or a session that expired — ends the account's presence in
 *  this browser. Days measured by one person must not still be readable by
 *  whoever signs in next. */
export function forget(store: Store = browserStore()): void {
  store.clear();
}

export function rememberDay(
  userId: string,
  iso: string,
  overview: DailyOverview,
  now: number = Date.now(),
  store: Store = browserStore(),
): void {
  const cache = mine(userId, store) ?? { userId, days: {} };
  const days = { ...cache.days, [iso]: { at: now, overview } };
  // Newest first by the day they describe, not by when they were fetched: a
  // refresh of an old day should not push out the ones around today.
  const keep = Object.keys(days).sort().reverse().slice(0, KEEP_DAYS);
  store.write({
    ...cache,
    userId,
    days: Object.fromEntries(keep.map((day) => [day, days[day]])),
  });
}

export function recallDay(
  userId: string,
  iso: string,
  store: Store = browserStore(),
): Remembered | null {
  const entry = mine(userId, store)?.days[iso];
  if (!entry || typeof entry.at !== "number" || !entry.overview) return null;
  // The day has to be the day. An entry filed under the wrong key would
  // otherwise be drawn under a date it never described.
  if (entry.overview.date !== iso) return null;
  return entry;
}

export function rememberConfig(
  userId: string,
  config: DashboardConfig,
  now: number = Date.now(),
  store: Store = browserStore(),
): void {
  const cache = mine(userId, store) ?? { userId, days: {} };
  store.write({ ...cache, userId, config: { at: now, config } });
}

export function recallConfig(userId: string, store: Store = browserStore()): DashboardConfig | null {
  return mine(userId, store)?.config?.config ?? null;
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
