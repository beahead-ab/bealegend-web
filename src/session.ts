import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, auth, type SignedInUser } from "./api";
import { claim, forget } from "./lastKnown";

/**
 * `restoring` prevents the app from painting a sign-in form before it knows
 * whether the cookie works. `restoreFailed` keeps that uncertainty explicit:
 * a transport/server failure is not evidence that the session ended.
 * Without this distinction the app
 * would paint the sign-in form for the instant it takes to ask whether the
 * cookie is still good — a returning user would see a flash of the one screen
 * they should never see.
 */
export type Session =
  | { status: "restoring" }
  | { status: "restoreFailed" }
  | { status: "signedIn"; user?: SignedInUser }
  | { status: "signedOut" }
  | { status: "signingIn" };

/**
 * What the offline cache must do when a session resolves.
 *
 * One rule, four ways in: a restored session, a fresh sign-in, an expired one
 * and a deliberate sign-out. Writing it once and calling it from all four is
 * the point — scattering it would mean one forgotten path is a leak, and the
 * thing being leaked is somebody's meals and weight.
 *
 * No id, no memory. A session we cannot attribute must not be able to read or
 * write days; failing closed costs a refetch and nothing else.
 */
export function applyToCache(
  outcome: { status: "signedIn"; user?: SignedInUser } | { status: "signedOut" },
  cache: { claim: (userId: string) => void; forget: () => void } = { claim, forget },
): void {
  if (outcome.status === "signedIn" && outcome.user?.id) cache.claim(outcome.user.id);
  else cache.forget();
}

/**
 * A rejected sign-in is the user's problem to fix and gets the server's own
 * sentence. Anything else is ours, and saying "wrong password" to someone whose
 * network dropped would send them hunting for a mistake they did not make.
 */
export function signInMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return error.message || "Fel e-post eller lösenord.";
  }
  if (error instanceof ApiError && error.message) return error.message;
  return "Inloggningen kunde inte genomföras. Försök igen om en stund.";
}

export function useSession() {
  const [session, setSession] = useState<Session>({ status: "restoring" });
  const generation = useRef(0);

  const retryRestore = useCallback(async () => {
    const attempt = ++generation.current;
    setSession({ status: "restoring" });
    try {
      const result = await auth.refresh();
      if (attempt !== generation.current) return;
      if (result.authenticated === false) {
        applyToCache({ status: "signedOut" });
        setSession({ status: "signedOut" });
      } else if (result.authenticated === true && typeof result.user?.id === "string" && result.user.id.trim()) {
        applyToCache({ status: "signedIn", user: result.user });
        setSession({ status: "signedIn", user: result.user });
      } else {
        // A malformed answer is not a confirmed identity or a logout.
        setSession({ status: "restoreFailed" });
      }
    } catch (error) {
      if (attempt !== generation.current) return;
      if (error instanceof ApiError && error.status === 401) {
        applyToCache({ status: "signedOut" });
        setSession({ status: "signedOut" });
      } else {
        // Keep owner-scoped memory, but do not mount any account surface until
        // the server confirms an identity. Never infer the user from cache.
        setSession({ status: "restoreFailed" });
      }
    }
  }, []);

  useEffect(() => {
    void retryRestore();
    return () => { generation.current += 1; };
  }, [retryRestore]);

  const signIn = useCallback(async (email: string, password: string) => {
    const attempt = ++generation.current;
    setSession({ status: "signingIn" });
    try {
      const result = await auth.signIn(email, password);
      if (attempt !== generation.current) return;
      if (result.authenticated !== true || typeof result.user?.id !== "string" || !result.user.id.trim()) {
        throw new ApiError(502, "Inloggningen kunde inte bekräftas. Försök igen.");
      }
      // Before the new session can read a single day: anything belonging to
      // whoever used this browser last is gone.
      applyToCache({ status: "signedIn", user: result.user });
      setSession({ status: "signedIn", user: result.user });
    } catch (error) {
      if (attempt !== generation.current) return;
      applyToCache({ status: "signedOut" });
      setSession({ status: "signedOut" });
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    generation.current += 1;
    // Hide and forget locally before waiting for the server. No late response
    // from an older restore/login/logout may claim or clear a newer account.
    applyToCache({ status: "signedOut" });
    setSession({ status: "signedOut" });
    // The server's cookie is the session. Failing to reach it must still end
    // the session here, or a network blip leaves someone stuck signed in.
    await auth.signOut().catch(() => undefined);
  }, []);

  return { session, signIn, signOut, retryRestore };
}
