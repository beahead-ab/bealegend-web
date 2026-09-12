import { useEffect, useRef, useState, type ReactNode } from "react";
import { BackIcon } from "./icons";
import { prepareAvatar } from "./avatarImage";
import { profileApi, profileError, type Profile } from "./profile";

export function ProfileView({ userId, onClose, floor }: {
  userId?: string; onClose: () => void; floor?: ReactNode;
}) {
  // A fresh owner gets a fresh component, including pending image bytes. No
  // profile or local preview is written to browser storage.
  return <ProfileForAccount key={userId ?? "no-account"} userId={userId} onClose={onClose} floor={floor} />;
}

function ProfileForAccount({ userId, onClose, floor }: {
  userId?: string; onClose: () => void; floor?: ReactNode;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState<"load" | "prepare" | "save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!userId || pending.current) return;
    const task = new AbortController(); pending.current = task;
    setBusy("load"); setError(null); setMessage(null); setConfirmRemove(false);
    try {
      const next = await profileApi.load(task.signal);
      if (task.signal.aborted) return;
      setProfile(next); setDraft(null); setUncertain(false); setFailedImage(null);
    } catch (e) { if (!task.signal.aborted) setError(profileError(e)); }
    finally { if (!task.signal.aborted) { pending.current = null; setBusy(null); } }
  };

  useEffect(() => {
    heading.current?.focus();
    void load();
    return () => { pending.current?.abort(); pending.current = null; };
    // Account changes remount this entire component; a late result cannot win.
  }, []);

  const choose = async (file: File) => {
    if (!profile || pending.current || uncertain) return;
    const task = new AbortController(); pending.current = task;
    setBusy("prepare"); setError(null); setMessage(null); setConfirmRemove(false);
    try {
      const image = await prepareAvatar(file, task.signal);
      if (!task.signal.aborted) setDraft(image);
    } catch (e) { if (!task.signal.aborted) setError(e instanceof Error ? e.message : "Bilden kunde inte läsas."); }
    finally { if (!task.signal.aborted) { pending.current = null; setBusy(null); } }
  };

  const change = async (remove: boolean) => {
    if (!profile || pending.current || uncertain || (!remove && !draft)) return;
    const task = new AbortController(); pending.current = task;
    setBusy(remove ? "remove" : "save"); setError(null); setMessage(null); setConfirmRemove(false);
    try {
      const next = remove ? await profileApi.remove(task.signal) : await profileApi.upload(draft!, task.signal);
      if (task.signal.aborted) return;
      setProfile(next); setDraft(null); setFailedImage(null);
      setMessage(remove ? "Profilbilden är borttagen." : "Profilbilden är sparad.");
    } catch (e) {
      if (!task.signal.aborted) { setError(profileError(e)); setUncertain(true); }
    } finally { if (!task.signal.aborted) { pending.current = null; setBusy(null); } }
  };

  const image = draft ?? profile?.avatarUrl;
  return (
    <div className="app-shell profile-shell">
      <header className="app-header">
        <button className="icon-button" onClick={onClose} aria-label="Tillbaka till Idag"><BackIcon size={18} /></button>
        <h1 ref={heading} tabIndex={-1}>Inställningar</h1>
      </header>
      <section className="card profile-card" aria-labelledby="profile-title" aria-busy={busy !== null}>
        <div className="kicker">Ditt konto</div>
        <h2 id="profile-title">Profilbild</h2>
        <p className="muted">Samma profilbild på webben och i appen. Bilden kan visas för andra i sociala funktioner.</p>
        {!userId && <p role="alert">Logga in för att ändra din profilbild.</p>}
        {profile && (
          <>
            <div className="profile-identity">
              {image && failedImage !== image
                ? <img className="profile-avatar" src={image} alt={draft ? "Förhandsvisning av vald profilbild" : "Din sparade profilbild"} onError={() => setFailedImage(image)} />
                : <span className="profile-avatar profile-initial" aria-label="Ingen profilbild visas">{profile.fullName?.trim().slice(0, 1).toUpperCase() || "·"}</span>}
              <div><p className="profile-name">{profile.fullName || "Ditt konto"}</p><p className="muted profile-email">{profile.email}</p></div>
            </div>
            {image && failedImage === image && <p role="status">Bilden kunde inte visas. Hämta igen för att kontrollera den sparade bilden.</p>}
            <input ref={picker} className="floor-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Välj profilbild" disabled={!!busy || uncertain} onChange={(event) => {
              const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
              if (file) void choose(file);
            }} />
            <div className="profile-actions">
              <button className="pill" disabled={!!busy || uncertain} onClick={() => picker.current?.click()}>{profile.avatarUrl ? "Byt bild" : "Välj bild"}</button>
              {draft && <button className="primary-button" disabled={!!busy || uncertain} onClick={() => void change(false)}>Spara bild</button>}
              {draft && <button className="quiet-button" disabled={!!busy} onClick={() => { setDraft(null); if (!uncertain) setError(null); }}>Ångra bildval</button>}
              {profile.avatarUrl && !draft && !confirmRemove && <button className="quiet-button profile-danger" disabled={!!busy || uncertain} onClick={() => setConfirmRemove(true)}>Ta bort bild</button>}
            </div>
            {draft && <p className="muted">Förhandsvisning — bilden är inte sparad ännu.</p>}
            <p className="muted profile-hint">Högst 5 MB. Bilden komprimeras före uppladdning. Om formatet inte stöds, välj JPG eller PNG.</p>
            {confirmRemove && <div className="profile-confirm" role="group" aria-label="Bekräfta borttagning">
              <p>Ta bort din sparade profilbild?</p>
              <button className="pill" onClick={() => setConfirmRemove(false)}>Behåll bilden</button>
              <button className="pill profile-danger" onClick={() => void change(true)}>Ja, ta bort</button>
            </div>}
          </>
        )}
        {busy && <p role="status">{({ load: "Hämtar profil…", prepare: "Förbereder bild…", save: "Sparar profilbild…", remove: "Tar bort profilbild…" })[busy]}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {message && <p className="profile-success" role="status">{message}</p>}
        {userId && !busy && <button className="quiet-button" disabled={!!draft && !uncertain} onClick={() => void load()}>Hämta profilen igen</button>}
      </section>
      {floor}
    </div>
  );
}
