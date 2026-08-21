import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";
import {
  blocks,
  canRun,
  estimateLabel,
  fetchTrainingHome,
  isEarlyFinish,
  modeReason,
  momentPrescription,
  phaseLabel,
  restLabel,
  setLine,
  sharedRest,
  type TrainingHome,
  type TrainingMoment,
  type TrainingRun,
  type TrainingSession,
} from "./training";
import { clockText, useRun } from "./useRun";

type Conversation = ReturnType<typeof useConversation>;

function Moment({ moment, here }: { moment: TrainingMoment; here: boolean }) {
  // Where the run stands opens itself. Everything else stays folded, so the
  // pass reads as a list until you ask a line to say more.
  const [open, setOpen] = useState(here);
  const sets = moment.prescribed_sets;
  const rest = sharedRest(sets);

  return (
    <div className={here ? "moment here" : "moment"}>
      <button className="moment-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="moment-name">{moment.name}</span>
        <span className="moment-prescription">{momentPrescription(moment)}</span>
        <span className="chevron" aria-hidden="true">{open ? "⌄" : "›"}</span>
      </button>

      {open && (
        <div className="moment-body">
          {moment.description && <p className="moment-description">{moment.description}</p>}
          {/* The set list is the prescription, not a plan the client invents:
              an empty one means the pass carries only the moment's own numbers. */}
          {sets.length > 0 && (
            <ol className="set-list">
              {sets.map((set) => (
                <li key={set.index}>
                  <span className="set-index">{set.index}</span>
                  <span className="set-line">{setLine(set, rest === null)}</span>
                </li>
              ))}
            </ol>
          )}
          {rest !== null && <p className="set-rest">{restLabel(rest)} mellan seten</p>}
          {moment.notes && <p className="moment-notes">{moment.notes}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * The run's controls, drawn from `allowed_actions` alone. A button whose rule
 * lived here would disagree with the server the first time the rule changed on
 * one side only — and the server is the side that decides.
 */
function RunBar({ session, state }: { session: TrainingSession; state: ReturnType<typeof useRun> }) {
  const { run } = state;
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  if (!run) {
    return (
      <div className="run-bar">
        <button className="primary-button" onClick={() => void state.start()} disabled={state.starting}>
          {state.starting ? "Startar …" : "Starta passet"}
        </button>
      </div>
    );
  }

  const early = isEarlyFinish(session, run);

  /**
   * Cancelling is not a quieter finish. The server discards the run and deletes
   * every set already recorded against it, so it asks first — and it never
   * stands next to the button that saves the pass, where one mis-tap would be
   * the difference between keeping an hour's work and losing it.
   */
  if (confirmingDiscard) {
    return (
      <div className="run-bar discarding">
        <p className="run-question">Kasta passet? Allt du loggat tas bort.</p>
        <div className="run-actions">
          <button className="pill" onClick={() => setConfirmingDiscard(false)}>Behåll</button>
          <button className="danger-button" onClick={() => { setConfirmingDiscard(false); state.act("cancel"); }}>
            Kasta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="run-bar">
      <div className="run-clock">
        <strong>{clockText(state.activeSeconds)}</strong>
        {run.status === "paused" && <span className="run-status">Pausat</span>}
        {state.pending > 0 && (
          // Said plainly rather than hidden: the pass is being run, the
          // commands are kept, and they will land. Silence here would read as
          // lost work.
          <span className="run-status">{state.pending} väntar på nätet</span>
        )}
      </div>
      <div className="run-actions">
        {state.can("pause") && <button className="pill" onClick={() => state.act("pause")}>Pausa</button>}
        {state.can("resume") && <button className="pill" onClick={() => state.act("resume")}>Återuppta</button>}
        {state.can("complete") && (
          <button className="primary-button" onClick={() => state.act("complete", { partial: early })}>
            {early ? "Avsluta i förtid" : "Avsluta passet"}
          </button>
        )}
      </div>
      {state.can("cancel") && (
        <div className="run-discard">
          <button className="quiet-button" onClick={() => setConfirmingDiscard(true)}>Kasta passet</button>
        </div>
      )}
    </div>
  );
}

function Session({ session, activeRun }: { session: TrainingSession; activeRun: TrainingRun | null }) {
  const estimate = estimateLabel(session.estimated_seconds);
  const state = useRun(session, activeRun);
  const here = state.run?.current_step_id ?? null;

  return (
    <>
      <div className="hero">
        <p>{session.title}</p>
        <span className="hero-rule" aria-hidden="true" />
      </div>
      {(session.summary || estimate) && (
        <p className="session-summary">
          {session.summary}
          {session.summary && estimate ? " · " : ""}
          {estimate}
        </p>
      )}

      {/* Said before the pass rather than at the start button: someone who has
          to move to the phone should learn it while there is still time to. */}
      {!canRun(session) && <p className="session-notice">{modeReason(session)}</p>}

      {state.error && <p className="error-message">{state.error}</p>}
      {canRun(session) && <RunBar session={session} state={state} />}

      {blocks(session).map((block) => (
        <section className="card block-card" key={block.position}>
          <h2>{phaseLabel(block.moments[0].phase)}</h2>
          {block.moments.map((moment) => (
            <Moment key={moment.id} moment={moment} here={moment.id === here} />
          ))}
        </section>
      ))}
    </>
  );
}

/**
 * A pass, read before it is run (#14). Nothing here starts or changes anything —
 * the run itself arrives with the command queue behind it, and a start button
 * without that queue would be the one thing this surface must not be.
 */
export function SessionView({ date, conversation, onClose, onOpenThread }: {
  date: Date;
  conversation: Conversation;
  onClose: () => void;
  onOpenThread: () => void;
}) {
  const [home, setHome] = useState<TrainingHome | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingHome(date)
      .then((result) => !cancelled && setHome(result))
      .catch(() => !cancelled && setError("Passet kunde inte hämtas."));
    return () => { cancelled = true; };
  }, [date]);

  const sessions = home?.today_sessions ?? null;
  // A run already going wins over the day's list: the server allows one at a
  // time, so anything else on screen would offer a start it would refuse.
  const running = home?.active_run && home.active_session ? home.active_session : null;
  const only = running ?? (sessions?.length === 1 ? sessions[0] : null);
  const open = only ?? sessions?.find((session) => session.id === chosen) ?? null;
  const activeRun = home?.active_run && open && home.active_run.session_id === open.id ? home.active_run : null;

  return (
    <div className="app-shell">
      <header className="thread-header">
        <button className="thread-back" onClick={() => (chosen && !only ? setChosen(null) : onClose())}>
          ‹ {chosen && !only ? "Dagens pass" : "Idag"}
        </button>
      </header>

      {error && <p className="error-message">{error}</p>}

      {sessions && sessions.length === 0 && (
        <div className="hero">
          <p>Inget pass står inplanerat idag.</p>
          <span className="hero-rule" aria-hidden="true" />
        </div>
      )}

      {open ? <Session key={open.id} session={open} activeRun={activeRun} /> : (
        sessions && sessions.length > 1 && (
          <>
            <div className="hero">
              <p>{sessions.length} pass idag.</p>
              <span className="hero-rule" aria-hidden="true" />
            </div>
            <section className="card group-card">
              <h2>Dagens pass</h2>
              {sessions.map((session) => (
                <div key={session.id}>
                  <button className="metric-button" onClick={() => setChosen(session.id)}>
                    <div className="metric-row">
                      <span className="muted">{session.title}</span>
                      <strong>{estimateLabel(session.estimated_seconds) ?? ""}</strong>
                      <span className="chevron" aria-hidden="true">›</span>
                    </div>
                  </button>
                </div>
              ))}
            </section>
          </>
        )
      )}

      {/* §3: the floor is on every surface, and it opens the same thread from
          here as from Idag — leaving a pass to ask something must not mean
          leaving the conversation. */}
      <CoachFloor conversation={conversation} onOpenThread={onOpenThread} inThread={false} />
    </div>
  );
}
