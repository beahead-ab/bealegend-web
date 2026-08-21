import { useCallback, useEffect, useState } from "react";
import { ApiError, auth, type SignedInUser } from "./api";

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
        if (!cancelled) setSession({ status: "signedIn", user: result.user });
      })
      .catch(() => {
        if (!cancelled) setSession({ status: "signedOut" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSession({ status: "signingIn" });
    try {
      const result = await auth.signIn(email, password);
      setSession({ status: "signedIn", user: result.user });
    } catch (error) {
      setSession({ status: "signedOut" });
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    // The server's cookie is the session. Failing to reach it must still end
    // the session here, or a network blip leaves someone stuck signed in.
    await auth.signOut().catch(() => undefined);
    setSession({ status: "signedOut" });
  }, []);

  return { session, signIn, signOut };
}
