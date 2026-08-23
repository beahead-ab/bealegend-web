import { useCallback, useEffect, useState } from "react";
import { ApiError, auth, type SignedInUser } from "./api";
import { claim, forget } from "./lastKnown";

/**
 * Four states, and `restoring` is the one that matters. Without it the app
 * would paint the sign-in form for the instant it takes to ask whether the
 * cookie is still good — a returning user would see a flash of the one screen
 * they should never see.
 */
export type Session =
  | { status: "restoring" }
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

  useEffect(() => {
    let cancelled = false;
    auth
      .refresh()
      .then((result) => {
        if (cancelled) return;
        applyToCache({ status: "signedIn", user: result.user });
        setSession({ status: "signedIn", user: result.user });
      })
      .catch(() => {
        if (cancelled) return;
        // An expired session is a session that ended. It ends here too.
        applyToCache({ status: "signedOut" });
        setSession({ status: "signedOut" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSession({ status: "signingIn" });
    try {
      const result = await auth.signIn(email, password);
      // Before the new session can read a single day: anything belonging to
      // whoever used this browser last is gone.
      applyToCache({ status: "signedIn", user: result.user });
      setSession({ status: "signedIn", user: result.user });
    } catch (error) {
      applyToCache({ status: "signedOut" });
      setSession({ status: "signedOut" });
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    // The server's cookie is the session. Failing to reach it must still end
    // the session here, or a network blip leaves someone stuck signed in.
    await auth.signOut().catch(() => undefined);
    // Cleared whether or not the server could be reached. A network blip must
    // not leave one person's measurements readable to the next.
    applyToCache({ status: "signedOut" });
    setSession({ status: "signedOut" });
  }, []);

  return { session, signIn, signOut };
}
