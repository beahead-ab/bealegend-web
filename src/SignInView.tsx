import { useState, type FormEvent } from "react";
import { signInMessage } from "./session";

/**
 * The mark and the wordmark, then two fields. iOS did this design work already
 * (`SignInView.swift`); this follows it rather than inventing a second look for
 * the same moment.
 */
export function SignInView({
  onSignIn,
  busy,
}: {
  onSignIn: (email: string, password: string) => Promise<void>;
  busy: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await onSignIn(email.trim(), password);
    } catch (reason) {
      // The password stays. Retyping it because the network hiccupped is a
      // small insult that a form has no reason to deliver.
      setError(signInMessage(reason));
    }
  };

  return (
    <div className="sign-in">
      <div className="sign-in-lockup">
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet="/brandmark-reverse.png" />
          <img src="/brandmark.png" alt="" className="sign-in-mark" />
        </picture>
        <span className="wordmark">BE A LEGEND</span>
      </div>

      <form className="card sign-in-form" onSubmit={submit}>
        <label>
          <span>E-post</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          <span>Lösenord</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="primary-button" disabled={busy || !email.trim() || !password}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>

        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
}
