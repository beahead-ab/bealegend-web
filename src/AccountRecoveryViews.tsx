import { useEffect, useState, type FormEvent } from "react";
import { ApiError, auth } from "./api";

function message(error: unknown): string {
  return error instanceof ApiError && error.message
    ? error.message
    : "Tjänsten kunde inte nås just nu. Försök igen om en stund.";
}

function Lockup() {
  return (
    <div className="sign-in-lockup">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet="/brandmark-reverse.png" />
        <img src="/brandmark.png" alt="" className="sign-in-mark" />
      </picture>
      <span className="wordmark">BE A LEGEND</span>
    </div>
  );
}

export function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sign-in">
      <Lockup />
      <form className="card sign-in-form" onSubmit={submit}>
        <div>
          <h1 className="account-title">Glömt lösenord</h1>
          <p className="account-copy">Skriv din e-postadress så skickar vi en personlig återställningslänk.</p>
        </div>

        {!sent ? (
          <>
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
            <button className="primary-button" disabled={busy || !email.trim()}>
              {busy ? "Skickar…" : "Skicka länk"}
            </button>
          </>
        ) : (
          <p className="success-message">
            Om adressen finns hos oss har vi skickat ett mejl med en länk som gäller i två timmar.
          </p>
        )}

        <button type="button" className="text-button" onClick={onBack} disabled={busy}>
          Tillbaka till inloggningen
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
}

export function SetPasswordView({
  token,
  onDone,
  onRequestNew,
}: {
  token: string;
  onDone: () => void;
  onRequestNew: () => void;
}) {
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setValidating(false);
      return;
    }
    auth
      .passwordToken(token)
      .then((result) => {
        if (!cancelled) setValid(result.valid);
      })
      .catch(() => {
        if (!cancelled) setValid(false);
      })
      .finally(() => {
        if (!cancelled) setValidating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Lösenorden är inte likadana.");
      return;
    }
    setBusy(true);
    try {
      await auth.setPassword(token, password);
      setUpdated(true);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sign-in">
      <Lockup />
      <form className="card sign-in-form" onSubmit={submit}>
        <div>
          <h1 className="account-title">Välj nytt lösenord</h1>
          <p className="account-copy">Länken är personlig och kan bara användas en gång.</p>
        </div>

        {validating ? (
          <p className="muted">Kontrollerar länken…</p>
        ) : updated ? (
          <>
            <p className="success-message">Lösenordet är uppdaterat. Du kan nu logga in.</p>
            <button type="button" className="primary-button" onClick={onDone}>
              Gå till inloggningen
            </button>
          </>
        ) : valid ? (
          <>
            <label>
              <span>Nytt lösenord</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label>
              <span>Upprepa lösenord</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <button className="primary-button" disabled={busy || !password || !confirmation}>
              {busy ? "Sparar…" : "Spara lösenord"}
            </button>
          </>
        ) : (
          <>
            <p className="error-message">Länken är ogiltig eller har gått ut.</p>
            <button type="button" className="text-button" onClick={onRequestNew}>
              Begär en ny länk
            </button>
          </>
        )}
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  );
}
