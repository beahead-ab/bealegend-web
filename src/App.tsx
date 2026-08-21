import { SignInView } from "./SignInView";
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="kicker">Be a Legend</div>
          <h1>Idag.</h1>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={signOut} title="Logga ut" aria-label="Logga ut">
            ⏻
          </button>
        </div>
      </header>

      <div className="centered">
        <div className="card">
          <p style={{ margin: 0 }}>Inloggad.</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Idag-ytan och chattgolvet byggs härnäst.
          </p>
        </div>
      </div>
    </div>
  );
}
