import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";
import {
  equipmentLabel,
  fetchTrainingHome,
  loadHeight,
  periodTitle,
  periodWeeks,
  programFacts,
  showsWeekNumber,
  weekTitle,
  type TrainingProgramSummary,
} from "./training";
import { BackIcon } from "./icons";

type Conversation = ReturnType<typeof useConversation>;

/**
 * Bågen: programmets form över sina veckor.
 *
 * Höjden är veckans last i förhållande till programmets tyngsta vecka, räknad
 * på servern ur ordinationen. Klienten skalar bara om talet till något som går
 * att rita — den räknar aldrig om det till kilon, eftersom den absoluta vikten
 * beror på vem som tränar medan formen är densamma för alla.
 *
 * Tom lista ritar ingenting alls. Ett program utan belastningsregler har ingen
 * sann kurva, och en platt rad staplar hade sett ut som ett svar.
 */
function Arc({ program }: { program: TrainingProgramSummary }) {
  const weeks = program.progression ?? [];
  const periods = program.periods ?? [];
  if (weeks.length === 0 && periods.length === 0) return null;

  return (
    <section className="card">
      <h2>Blocken</h2>

      {weeks.length > 0 && (
        <ol className="arc" aria-label="Belastning per vecka">
          {weeks.map((week) => (
            <li key={week.week_index} className="arc-week" title={weekTitle(week)}>
              <span
                className={week.is_test ? "arc-bar test" : week.is_deload ? "arc-bar deload" : "arc-bar"}
                style={{ height: `${loadHeight(week)}%` }}
              />
              <span className="arc-label muted">
                {showsWeekNumber(week.week_index, weeks.length) ? week.week_index + 1 : ""}
              </span>
            </li>
          ))}
        </ol>
      )}

      {periods.length > 0 && (
        <ul className="period-list">
          {periods.map((period) => {
            const title = periodTitle(period);
            return (
              <li className="period-row" key={`${period.start_week}-${period.end_week}`}>
                {/* En period utan namn och utan roll är ett veckospann och
                    inget mer. »Period 2« hade varit ett namn vi hittat på. */}
                {title && <strong>{title}</strong>}
                <span className="muted">{periodWeeks(period)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Programmet, som det ser ut innan man börjar — och medan man går i det.
 *
 * Varje tal här är serverns: pass per vecka, passlängd, utrustning, bilden och
 * bågen räknas där. Ytan väljer ordning och ord, aldrig siffror. Två klienter
 * som räknade själva hade beskrivit samma program olika.
 */
function Program({ program }: { program: TrainingProgramSummary }) {
  const facts = programFacts(program);
  const equipment = equipmentLabel(program.equipment);
  const reasons = program.reasons ?? [];

  return (
    <>
      <div className="hero">
        <p>{program.title}</p>
        <span className="hero-rule" aria-hidden="true" />
      </div>

      {/* Bilden är vald på servern: den uppladdade vinner, annars klippets egen
          stillbild, annars ingen alls. Ingen dekorativ standardbild — en bild
          som inte hör till programmet påstår något om det. */}
      {program.image_url && (
        <img className="program-image" src={program.image_url} alt="" />
      )}

      {program.summary && <p className="session-summary">{program.summary}</p>}

      {facts.length > 0 && (
        <div className="program-facts">
          {facts.map((fact) => <span className="chip" key={fact}>{fact}</span>)}
        </div>
      )}

      {/* Skälen, i klartext och aldrig som en matchningsprocent: »87 %« betyder
          »bäst av dessa«, inte »87 % rätt«, och ett tal som ser exakt ut men
          inte är det går inte att ifrågasätta. Tom lista ritar ingen rubrik. */}
      {reasons.length > 0 && (
        <section className="card">
          <h2>Varför det här passar dig</h2>
          <ul className="program-reasons">
            {reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </section>
      )}

      <Arc program={program} />

      {equipment && (
        <section className="card">
          <h2>Utrustning</h2>
          {/* Orden som innehållet bär dem. Se equipmentLabel. */}
          <p className="muted">{equipment}</p>
        </section>
      )}
    </>
  );
}

function ProgramSkeleton() {
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
 * Programsidan — »där man blir taggad«.
 *
 * Läser `assigned_program` ur dagskontraktet. Ingen egen väg och ingen egen
 * uträkning: fälten har legat i `training-home.v1` sedan programmets fakta
 * kom, och den här klienten läste dem bara inte.
 */
export function ProgramView({ date, conversation, onClose, onOpenThread }: {
  date: Date;
  conversation: Conversation;
  onClose: () => void;
  onOpenThread: () => void;
}) {
  const [program, setProgram] = useState<TrainingProgramSummary | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingHome(date)
      .then((home) => {
        if (cancelled) return;
        setProgram(home.assigned_program ?? null);
        setLoaded(true);
      })
      .catch(() => !cancelled && setError("Programmet kunde inte hämtas just nu."));
    return () => { cancelled = true; };
  }, [date, attempt]);

  return (
    <div className="app-shell">
      <header className="thread-header">
        <button className="thread-back" onClick={onClose}>
          <BackIcon /> Tillbaka
        </button>
      </header>

      {error && (
        <div className="error-message" role="status">
          <span>{error}</span>
          <button className="pill" onClick={() => setAttempt((n) => n + 1)}>Försök igen</button>
        </div>
      )}

      {!loaded && !error && <ProgramSkeleton />}

      {/* Inget program är inte ett fel, och inte ett tomt skal heller. Meningen
          säger vad läget är; att välja ett program är en egen yta som inte
          finns än, och en knapp hit hade lovat en väg som inte går någonstans. */}
      {loaded && !program && (
        <div className="hero">
          <p>Du följer inget program just nu.</p>
          <span className="hero-rule" aria-hidden="true" />
        </div>
      )}

      {program && <Program program={program} />}

      <CoachFloor conversation={conversation} onOpenThread={onOpenThread} inThread={false} />
    </div>
  );
}
