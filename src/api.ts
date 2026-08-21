export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /**
     * The parsed body, kept rather than discarded. A 409 from a training-run
     * command carries the current run inside it precisely so the loser can
     * resync from the rejection — throwing that away would force a second
     * round trip to learn what the first response already said.
     */
    public body?: unknown,
  ) {
    super(message);
  }
}

/**
 * The server's error envelope is `{error: {code, message}}`. Read in one place
 * so no caller has to know its shape, and so a body that is not JSON at all —
 * a proxy timing out, say — still produces a sentence rather than a crash.
 */
async function errorFrom(response: Response): Promise<ApiError> {
  const body = await response.json().catch(() => null);
  const error = body?.error;
  return new ApiError(
    response.status,
    error?.message || "Tjänsten kunde inte nås just nu. Försök igen om en stund.",
    error?.code,
    body,
  );
}

/**
 * A page that fires several requests at once can meet the same expired access
 * token several times. Without sharing one in-flight refresh, each 401 calls
 * /refresh independently with a single-use refresh token — the first wins and
 * every other one 401s in turn, signing the user out mid-load.
 *
 * Learned in the admin portal, which hit exactly this. Carried over rather than
 * rediscovered.
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/api/v1/web-auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    // The session is an HttpOnly cookie; nothing here ever holds a token.
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  // Never on the auth endpoints themselves: a failed sign-in is an answer, and
  // refreshing in response to it would loop.
  if (response.status === 401 && retry && !path.includes("/web-auth/")) {
    if (await refreshSession()) return request<T>(path, init, false);
  }

  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * The training-run contract, built now although the MVP runs no sessions.
 *
 * The server serialises mutations per run with a row lock, keeps an idempotency
 * log keyed by `command_id`, and rejects a stale `expected_version` with 409 —
 * carrying the current run in the body so a loser can resync from the rejection
 * itself. Three rules follow, and all three are the client's to keep:
 *
 * 1. One id per command, reused across retries. Generating a fresh one per
 *    attempt turns a dropped connection into a double-logged set.
 * 2. `expected_version` always sent. The server accepts null and skips the
 *    check, so last-write-wins is available to anyone careless enough — the
 *    discipline lives here, not there.
 * 3. Adopt `current_run` from the 409 instead of refetching.
 *
 * Retrofitting this once session execution exists never comes out clean, which
 * is why it is here before there is anything to run.
 */
export type RunCommand<T> = {
  command_id: string;
  expected_version: number;
  action: string;
} & T;

export function newCommandId(): string {
  return crypto.randomUUID();
}

/**
 * Reads the run the server already handed back with its rejection. Returns null
 * for anything that is not a stale-version conflict, so a caller can pass every
 * error through this and act only when there is something to adopt.
 */
export function staleRunFrom<TRun>(error: unknown): TRun | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.code !== "stale_run_version") return null;
  return (error.body as { current_run?: TRun } | null)?.current_run ?? null;
}
