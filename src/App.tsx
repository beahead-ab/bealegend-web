import { SignInView } from "./SignInView";
import { TodayView } from "./TodayView";
import { useSession } from "./session";

export function App() {
  // One call, not two. Two would be two independent state machines, and the
  // one holding signIn would not be the one being rendered — signing in would
  // succeed against a state nobody is looking at.
  const { session, signIn, signOut } = useSession();

  if (session.status === "restoring") {
    return (
      <div className="app-shell">
        <div className="centered">
          <p className="muted">Hämtar din session…</p>
        </div>
      </div>
    );
  }

  if (session.status === "signedOut" || session.status === "signingIn") {
    return (
      <div className="app-shell">
        <SignInView onSignIn={signIn} busy={session.status === "signingIn"} />
      </div>
    );
  }

  return <TodayView onSignOut={signOut} />;
}
