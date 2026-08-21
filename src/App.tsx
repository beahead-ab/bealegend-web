/**
 * The shell. Sign-in, the Idag surface and the chat floor arrive as their own
 * issues (#2, #3, #4) — this establishes the chrome and the frame they hang in,
 * and nothing else.
 */
export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="kicker">Be a Legend</div>
          <h1>Webben</h1>
        </div>
      </header>

      <div className="centered">
        <div className="card">
          <p style={{ margin: 0 }}>Skelettet står.</p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Inloggning, Idag och chattgolvet byggs härnäst.
          </p>
        </div>
      </div>
    </div>
  );
}
