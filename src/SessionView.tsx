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
  restSpan,
  rpeWords,
  setLine,
  sharedRest,
  type PrescribedSet,
  type TrainingHome,
  type TrainingMoment,
  type TrainingRun,
  type TrainingSession,
} from "./training";
import {
  receiptFrom,
  receiptHeading,
  resultFor,
  setsLine,
  volumeLine,
  type Receipt as PassReceipt,
} from "./receipt";
import { clockText, setKey, useRun, type LoggedSet } from "./useRun";
import { BackIcon, ChevronIcon } from "./icons";

type Conversation = ReturnType<typeof useConversation>;

/** Where back actually goes. Promising "Idag" from a pass reached by paging
 *  back a week was the surface saying one thing and doing another. */
function dayLabel(date: Date): string {
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? "Idag"
    : date.toLocaleDateString("sv-SE", { weekday: "long" });
}

function numberOrNull(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : null;
}

/**
 * The current set, as a thing to confirm rather than a form to fill in. The
 * prescription is already in the fields; someone mid-pass should be able to
 * press one button with a bar still on their back.
 */
function SetLogger({ set, stepId, state }: {
  set: PrescribedSet;
  stepId: string;
  state: ReturnType<typeof useRun>;
}) {
  const [repetitions, setRepetitions] = useState(set.repetitions != null ? String(set.repetitions) : "");
  // Written the way the rest of the surface writes it: 82,5, not 82.5.
  // numberOrNull reads the comma back, so typing either works.
  const [weight, setWeight] = useState(
    set.suggested_weight_kg != null ? set.suggested_weight_kg.toLocaleString("sv-SE") : "",
  );
  const [rpe, setRpe] = useState("");

  const suggested = set.suggested_weight_kg;
  const typedRpe = numberOrNull(rpe);
  const typedWeight = numberOrNull(weight);
  // Unchanged means unsent: the server then records the weight it froze at the
  // start, which is the number this field was filled from in the first place.
  const changedWeight = typedWeight !== null && typedWeight !== suggested ? typedWeight : null;

  const log = (action: "complete_set" | "skip_set") => {
    state.logSet(action, stepId, set.index, {
      repetitions: numberOrNull(repetitions),
      weightKg: changedWeight,
      effortRpe: numberOrNull(rpe),
    });
    // The prescription already says how long to rest; nobody should have to
    // read it off the screen and then time it themselves.
    state.startRest(set.rest_seconds);
  };

  return (
    <div className="set-logger">
      <div className="set-fields">
        {set.repetitions != null && (
          <label>
            <span>Reps</span>
            <input inputMode="numeric" value={repetitions} onChange={(e) => setRepetitions(e.target.value)} />
          </label>
        )}
        {suggested != null && (
          <label>
            <span>Vikt (kg)</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
        )}
        <label>
          <span>RPE</span>
          <input inputMode="decimal" value={rpe} onChange={(e) => setRpe(e.target.value)} placeholder="–" />
          {/* The number means something, and the meaning is what someone
              mid-pass actually knows. It appears as they type rather than as a
              legend nobody reads before the first set. */}
          <small className="field-hint muted">
            {typedRpe != null ? rpeWords(typedRpe) : "10 = inget mer rep fanns"}
          </small>
        </label>
      </div>
      {/* Pressed sweaty, one-handed, often with the bar still racked. It gets
          the width and the height; the quieter choice gets a text line under. */}
      <div className="set-buttons">
        <button className="primary-button wide" onClick={() => log("complete_set")}>Klart</button>
        <button className="quiet-button centred" onClick={() => log("skip_set")}>Hoppa över</button>
      </div>
    </div>
  );
}

function setMark(logged: LoggedSet | undefined): string | null {
  if (!logged) return null;
  return logged.status === "skipped" ? "Överhoppat" : "Klart";
}

/**
 * Kvittot, som passvyn blir när körningen är slut.
 *
 * Ordinationen fälls bort: den frågan är besvarad. Kvar står vad som faktiskt
 * hände, i passets egen ordning.
 */
function Receipt({ receipt }: { receipt: PassReceipt }) {
  const sets = setsLine(receipt);
  const volume = volumeLine(receipt);

  return (
    <>
      <div className="hero">
        <p>{receiptHeading(receipt)}</p>
        <span className="hero-rule" aria-hidden="true" />
      </div>

      <div className="program-facts">
        <span className="chip">{clockText(receipt.activeSeconds)} aktiv tid</span>
        {sets && <span className="chip">{sets}</span>}
        {volume && <span className="chip">{volume}</span>}
      </div>

      {/* Ett pass utan loggade set får inget kvarto av moment — och ingen tom
          ruta heller. Tiden och rubriken är då allt som är sant. */}
      {receipt.moments.map((moment) => (
        <section className="card" key={moment.stepId}>
          <h2>{moment.name}</h2>
          <ol className="set-list">
            {moment.sets.map((set) => (
              <li key={set.index} className={set.status === "skipped" ? "skipped" : undefined}>
                <span className="set-index">{set.index}</span>
                <span className="set-line">{set.line}</span>
                {set.status === "skipped" && <span className="set-mark">Överhoppat</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}

function Moment({ moment, here, state }: {
  moment: TrainingMoment;
  here: boolean;
  state: ReturnType<typeof useRun>;
}) {
  // Where the run stands opens itself. Everything else stays folded, so the
  // pass reads as a list until you ask a line to say more.
  const [open, setOpen] = useState(here);

  /**
   * …och det gäller även när körningen kommer hit efteråt.
   *
   * `useState(here)` fångar bara läget vid montering, och vid montering har
   * passet inte startat: `here` är falskt för varje moment. Utan det här
   * öppnade »Starta passet« ingenting, och den som just tryckt igång ett pass
   * fick leta efter setloggaren bakom en hopfälld rad.
   *
   * Bara i öppnande riktning. Att fälla ihop momentet igen när körningen går
   * vidare hade slitit sidan under handen på den som läser föregående moment.
   */
  useEffect(() => {
    if (here) setOpen(true);
  }, [here]);
  const sets = moment.prescribed_sets;
  const rest = sharedRest(sets);
  const currentSet = here ? sets.find((set) => set.index === state.run?.current_set_index) : undefined;

  return (
    <div className={here ? "moment here" : "moment"}>
      <button className="moment-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="moment-name">{moment.name}</span>
        <span className="moment-prescription">{momentPrescription(moment)}</span>
        <span className="chevron"><ChevronIcon down={open} /></span>
      </button>

      {open && (
        <div className="moment-body">
          {moment.description && <p className="moment-description">{moment.description}</p>}
          {/* The set list is the prescription, not a plan the client invents:
              an empty one means the pass carries only the moment's own numbers. */}
          {sets.length > 0 && (
            <ol className="set-list">
              {sets.map((set) => {

                // Det egna minnet först — det är omedelbart. Serverns lista
                // fyller i resten, så ett pass som börjat i telefonen inte
                // visar sina första set omärkta som om de inte hänt.
                const logged = state.logged[setKey(moment.id, set.index)];
                const stored = logged ? undefined : resultFor(state.run, moment.id, set.index);
                const mark = setMark(logged)
                  ?? (stored ? (stored.status === "skipped" ? "Överhoppat" : "Klart") : null);
                const current = here && state.run?.current_set_index === set.index;
                return (
                  <li key={set.index} className={current ? "current" : undefined}>
                    <span className="set-index">{set.index}</span>
                    <span className="set-line">
                      {setLine(set, rest === null, current)}
                      {/* On the set being done now, the RPE gets its meaning
                          spelled out. On the rest it would be four repetitions
                          of the same sentence. */}
                      {current && set.target_rpe != null && (
                        <em className="set-gloss muted"> {rpeWords(set.target_rpe)}</em>
                      )}
                    </span>
                    {mark && <span className="set-mark">{mark}</span>}
                  </li>
                );
              })}
            </ol>
          )}

          {here && state.can("complete_set") && currentSet && (
            // Keyed on the set, so advancing to the next one starts from its
            // prescription rather than from the last one's typing.
            <SetLogger
              key={setKey(moment.id, currentSet.index)}
              set={currentSet}
              stepId={moment.id}
              state={state}
            />
          )}

          {/* A moment with no prescribed sets — a warm-up row, a stretch — still
              has to be finishable, or the run stops at it with nothing to press. */}
          {here && !currentSet && state.can("complete_step") && (
            <div className="set-buttons">
              <button className="primary-button" onClick={() => state.act("complete_step", { step_id: moment.id })}>
                Klart
              </button>
            </div>
          )}
          {rest !== null && <p className="set-rest">{restSpan(rest)} mellan seten</p>}
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
      {/* Spoken as well as shown. "Pausat" and "3 väntar på nätet" are exactly
          the facts we chose to write in plain words — but only for whoever can
          see them. */}
      <div className="run-clock" role="status">
        <strong>{clockText(state.activeSeconds)}</strong>
        <span className="run-status">aktiv tid</span>
        {run.status === "paused" && <span className="run-status">Pausat</span>}
        {state.pending > 0 && (
          // Said plainly rather than hidden: the pass is being run, the
          // commands are kept, and they will land. Silence here would read as
          // lost work.
          <span className="run-status">{state.pending} väntar på nätet</span>
        )}
      </div>
      {state.restRemaining !== null && (
        <div className={state.restRemaining === 0 ? "rest-chip done" : "rest-chip"} role="status">
          <span className="rest-word">{state.restRemaining === 0 ? "Vila klar" : "Vila"}</span>
          {state.restRemaining > 0 && <strong>{clockText(state.restRemaining)}</strong>}
          {state.restRemaining > 0 && (
            <button className="pill" onClick={() => state.addRest(30)}>+30 s</button>
          )}
          <button className="pill" onClick={state.skipRest}>
            {state.restRemaining === 0 ? "Klart" : "Hoppa"}
          </button>
        </div>
      )}

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
  const receipt = state.run ? receiptFrom(session, state.run) : null;

  // Kvittot ersätter passvyn i stället för att läggas ovanpå den. Det som
  // skulle göras är gjort, och att låta ordinationen stå kvar under hade
  // bjudit in till att logga ett set till i ett pass som är avslutat.
  if (receipt) return <Receipt receipt={receipt} />;

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

      {state.error && <p className="error-message" role="status">{state.error}</p>}
      {canRun(session) && <RunBar session={session} state={state} />}

      {blocks(session).map((block) => (
        <section className="card block-card" key={block.position}>
          <h2>{phaseLabel(block.moments[0].phase)}</h2>
          {block.moments.map((moment) => (
            <Moment key={moment.id} moment={moment} here={moment.id === here} state={state} />
          ))}
        </section>
      ))}
    </>
  );
}

/** The pass before it arrives — same shape as the day's skeleton, so the two
 *  surfaces wait in the same way. */
function PassSkeleton() {
  return (
    <>
      <div className="hero">
        <div className="skeleton-line long" />
        <span className="hero-rule" aria-hidden="true" />
      </div>
      <section className="card block-card">
        <h2>Uppvärmning</h2>
        <div className="skeleton-line short" />
        <div className="skeleton-line short" />
      </section>
    </>
  );
}

/**
 * A pass, read before it is run (#14). Nothing here starts or changes anything —
 * the run itself arrives with the command queue behind it, and a start button
 * without that queue would be the one thing this surface must not be.
 */
export function SessionView({ date, conversation, onClose, onOpenThread, onOpenProgram }: {
  date: Date;
  conversation: Conversation;
  onClose: () => void;
  onOpenThread: () => void;
  onOpenProgram: () => void;
}) {
  const [home, setHome] = useState<TrainingHome | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingHome(date)
      .then((result) => !cancelled && setHome(result))
      // The pass already on screen stays. Mid-run, "load the page again" is the
      // most expensive instruction this surface can give.
      .catch(() => !cancelled && setError("Passet kunde inte hämtas just nu."));
    return () => { cancelled = true; };
  }, [date, attempt]);

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
          <BackIcon /> {chosen && !only ? "Dagens pass" : dayLabel(date)}
        </button>
        {/* Vägen till programmet passet hör till. Mitt i ett pass är frågan
            »varför just det här?« — och svaret ligger en yta bort, inte i en
            mening vi skriver här. */}
        <button className="quiet-button" onClick={onOpenProgram}>Programmet</button>
      </header>

      {error && (
        <div className="error-message" role="status">
          <span>{error}</span>
          <button className="pill" onClick={() => setAttempt((n) => n + 1)}>Försök igen</button>
        </div>
      )}

      {!home && !error && <PassSkeleton />}

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
                      <span className="chevron"><ChevronIcon /></span>
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
