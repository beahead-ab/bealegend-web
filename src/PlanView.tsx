import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";
import {
  dayStateLabel,
  fetchTrainingPlan,
  isViewedDay,
  loadShare,
  sessionCount,
  weekPeriod,
  weekStateLabel,
  weekVolume,
  weekdayLabel,
  type PlanWeek,
  type TrainingPlan,
} from "./plan";
import { BackIcon, ChevronIcon } from "./icons";

type Conversation = ReturnType<typeof useConversation>;

/**
 * Bågen: gjort, hoppat över, planerat (TR-07).
 *
 * En ruta per vecka, färgad av veckans **läge** — inte av dess tyngd. Formen
 * på programmet ritas på programsidan; det här är resan genom det, och de två
 * frågorna förtjänar varsin bild.
 *
 * Lägena kommer från servern. En klient som räknade ut vilka veckor som är
 * gjorda hade behövt veta vad »missat« betyder, och det är ett påstående om
 * användaren som servern ska stå för.
 */
function Arc({ plan, open, onOpen }: {
  plan: TrainingPlan;
  open: number;
  onOpen: (week: number) => void;
}) {
  return (
    <ol className="plan-arc" aria-label="Programmets veckor">
      {plan.weeks.map((week) => {
        const classes = ["plan-arc-week", `state-${week.state}`];
        if (week.deload) classes.push("deload");
        if (week.week === open) classes.push("open");
        return (
          <li key={week.week}>
            <button
              className={classes.join(" ")}
              onClick={() => onOpen(week.week)}
              aria-current={week.state === "current" ? "step" : undefined}
              title={`Vecka ${week.week} · ${weekStateLabel(week.state)}`}
            >
              <span className="plan-arc-number">{week.week}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** De sju dagarna, med sitt läge uttalat av servern. */
function Days({ week, plan }: { week: PlanWeek; plan: TrainingPlan }) {
  if (week.days.length === 0) return null;
  return (
    <ol className="plan-days">
      {week.days.map((day) => (
        <li
          key={day.date}
          className={isViewedDay(day, plan) ? `plan-day state-${day.state} today` : `plan-day state-${day.state}`}
        >
          <span className="plan-day-name muted">{weekdayLabel(day.date)}</span>
          <span className="plan-day-body">
            {/* Passets namn när det finns ett, annars dagens ord. En tom dag
                säger »Vila« därför att servern säger det — inte därför att
                listan är tom. */}
            {day.sessions.length > 0
              ? day.sessions.map((session) => (
                <span className="plan-session" key={`${session.routine_revision_id}-${session.title}`}>
                  {session.title}
                </span>
              ))
              : <span className="muted">{dayStateLabel(day.state)}</span>}
          </span>
          {day.sessions.length > 0 && (
            <span className="plan-day-state muted">{dayStateLabel(day.state)}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Week({ week, plan, open, onToggle }: {
  week: PlanWeek;
  plan: TrainingPlan;
  open: boolean;
  onToggle: () => void;
}) {
  const period = weekPeriod(week);
  const sessions = sessionCount(week);
  const volume = weekVolume(week);
  const share = loadShare(week);

  return (
    <div className={open ? "plan-week open" : "plan-week"}>
      <button className="plan-week-head" onClick={onToggle} aria-expanded={open}>
        <span className="plan-week-title">
          <strong>Vecka {week.week}</strong>
          {period && <span className="muted"> · {period}</span>}
          {/* Avlastning sägs ut även när perioden inte heter så: en lätt vecka
              är lätt med flit, och den som inte vet det tror att den är fel. */}
          {week.deload && !period && <span className="muted"> · Avlastning</span>}
        </span>
        <span className="plan-week-state">{weekStateLabel(week.state)}</span>
        <span className="chevron"><ChevronIcon down={open} /></span>
      </button>

      {open && (
        <div className="plan-week-body">
          {/* Coachens egen mening, när han skrivit en. Ingen text hittas på
              ur roll och nummer — två ytor som gjorde det hade hittat på
              olika. */}
          {week.description && <p className="plan-week-note">{week.description}</p>}

          <div className="plan-week-facts">
            {sessions && <span className="chip">{sessions}</span>}
            {volume && <span className="chip">{volume}</span>}
          </div>

          {/* Stapeln ritas bara när både lyft och mål finns. Utan mål finns
              ingen andel, och en stapel utan skala hade sett ut som ett svar. */}
          {share !== null && (
            <div className="plan-load" role="presentation">
              <span className="plan-load-fill" style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
          )}

          <Days week={week} plan={plan} />
        </div>
      )}
    </div>
  );
}

function PlanSkeleton() {
  return (
    <>
      <div className="hero">
        <div className="skeleton-line long" />
        <span className="hero-rule" aria-hidden="true" />
      </div>
      <section className="card">
        <div className="skeleton-line short" />
        <div className="skeleton-line short" />
      </section>
    </>
  );
}

/**
 * Planen — hela programmet som en tidslinje, och den enda ytan i webben som
 * visar en framtid.
 *
 * Varje påstående kommer från `training-plan.v1`: veckans läge, dagens läge,
 * volymen och veckotexten. Ytan väljer ordning och ord.
 */
export function PlanView({ conversation, onClose, onOpenThread, onOpenProgram }: {
  conversation: Conversation;
  onClose: () => void;
  onOpenThread: () => void;
  onOpenProgram: () => void;
}) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingPlan()
      .then((result) => {
        if (cancelled) return;
        setPlan(result);
        // Veckan man står i öppnas. Allt annat är hopfällt, så planen läses
        // som en resa och inte som tolv utfällda veckor.
        setOpen(result.current_week);
        setLoaded(true);
      })
      .catch((reason) => {
        if (cancelled) return;
        // Utan tilldelat program finns ingen plan, och servern svarar med en
        // mening i stället för ett tomt skal. Det är inget fel.
        setLoaded(true);
        setError(reason instanceof Error ? reason.message : "Planen kunde inte hämtas just nu.");
      });
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className="app-shell">
      <header className="thread-header">
        <button className="thread-back" onClick={onClose}>
          <BackIcon /> Idag
        </button>
        <button className="quiet-button" onClick={onOpenProgram}>Programmet</button>
      </header>

      {!loaded && <PlanSkeleton />}

      {loaded && !plan && (
        <>
          <div className="hero">
            <p>{error || "Du följer inget program just nu."}</p>
            <span className="hero-rule" aria-hidden="true" />
          </div>
          {error && (
            <button className="quiet-button centred" onClick={() => setAttempt((n) => n + 1)}>
              Försök igen
            </button>
          )}
        </>
      )}

      {plan && (
        <>
          <div className="hero">
            <p>{plan.program.title}</p>
            <span className="hero-rule" aria-hidden="true" />
          </div>
          <p className="session-summary">
            Vecka {plan.current_week} av {plan.weeks.length}
          </p>

          <section className="card">
            <Arc plan={plan} open={open ?? plan.current_week} onOpen={setOpen} />
            <div className="plan-legend muted">
              <span className="state-completed">Gjort</span>
              <span className="state-missed">Missat</span>
              <span className="state-current">Nu</span>
              <span className="state-upcoming">Kommer</span>
            </div>
          </section>

          <section className="card">
            {plan.weeks.map((week) => (
              <Week
                key={week.week}
                week={week}
                plan={plan}
                open={week.week === (open ?? plan.current_week)}
                onToggle={() => setOpen(week.week === open ? -1 : week.week)}
              />
            ))}
          </section>
        </>
      )}

      <CoachFloor conversation={conversation} onOpenThread={onOpenThread} inThread={false} />
    </div>
  );
}
