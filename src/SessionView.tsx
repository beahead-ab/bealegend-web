import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";
import {
  blocks,
  canRun,
  estimateLabel,
  fetchTrainingHome,
  modeReason,
  momentPrescription,
  phaseLabel,
  restLabel,
  setLine,
  sharedRest,
  type TrainingMoment,
  type TrainingSession,
} from "./training";

type Conversation = ReturnType<typeof useConversation>;

function Moment({ moment }: { moment: TrainingMoment }) {
  const [open, setOpen] = useState(false);
  const sets = moment.prescribed_sets;
  const rest = sharedRest(sets);

  return (
    <div className="moment">
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

function Session({ session }: { session: TrainingSession }) {
  const estimate = estimateLabel(session.estimated_seconds);

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

      {blocks(session).map((block) => (
        <section className="card block-card" key={block.position}>
          <h2>{phaseLabel(block.moments[0].phase)}</h2>
          {block.moments.map((moment) => <Moment key={moment.id} moment={moment} />)}
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
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingHome(date)
      .then((home) => !cancelled && setSessions(home.today_sessions))
      .catch(() => !cancelled && setError("Passet kunde inte hämtas."));
    return () => { cancelled = true; };
  }, [date]);

  const only = sessions?.length === 1 ? sessions[0] : null;
  const open = only ?? sessions?.find((session) => session.id === chosen) ?? null;

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

      {open ? <Session session={open} /> : (
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
