import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import type { useConversation } from "./conversation";
import { isoDate } from "./daily";
import {
  assignProgram,
  equipmentLabel,
  fetchTrainingHome,
  loadHeight,
  periodTitle,
  periodWeeks,
  nextMonday,
  startDayLabel,
  programFacts,
  showsWeekNumber,
  switchWarning,
  weekTitle,
  weeksLabel,
  type TrainingHome,
  type TrainingProgramSummary,
} from "./training";
import { BackIcon, ChevronIcon } from "./icons";

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

/**
 * Att börja följa ett program.
 *
 * Startdatumet är förvalt till närmaste måndag men går att ändra: ett program
 * är skrivet i veckor, och ett som börjar på en torsdag ger en första vecka på
 * fyra dagar. Förval, inte tvång.
 *
 * Byter man program står vad som händer **före** knappen. Servern avslutar den
 * gamla tilldelningen och tar bort kommande pass man inte rört — det är inget
 * man ska upptäcka efteråt.
 */
function Follow({ program, current, onFollowed }: {
  program: TrainingProgramSummary;
  current: TrainingProgramSummary | null;
  onFollowed: (home: TrainingHome) => void;
}) {
  const [startsOn, setStartsOn] = useState(() => isoDate(nextMonday(new Date())));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const warning = switchWarning(current, program);
  const day = startDayLabel(startsOn);

  const follow = async () => {
    setBusy(true);
    setError("");
    try {
      onFollowed(await assignProgram(program.id, startsOn));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Programmet kunde inte startas.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Följ det här</h2>
      {warning && <p className="session-notice">{warning}</p>}
      <label className="start-date">
        <span className="muted">Börjar</span>
        <input
          type="date"
          value={startsOn}
          min={isoDate(new Date())}
          onChange={(event) => setStartsOn(event.target.value)}
        />
      </label>
      {/* Dagen i ord. Fältet ovan ritas i webbläsarens format, inte sidans, och
          »08/31« går inte att läsa entydigt för den som väntar sig »31/08«. */}
      {day && <p className="start-day muted">{day}</p>}
      {error && <p className="error-message" role="status">{error}</p>}
      <button className="primary-button wide" onClick={() => void follow()} disabled={busy || !startsOn}>
        {busy ? "Startar …" : "Följ programmet"}
      </button>
    </section>
  );
}

/** De andra programmen, som rader man kan öppna. */
function Others({ programs, onOpen }: {
  programs: TrainingProgramSummary[];
  onOpen: (id: string) => void;
}) {
  if (programs.length === 0) return null;
  return (
    <section className="card group-card">
      <h2>Andra program</h2>
      {programs.map((program) => (
        <button className="metric-button" key={program.id} onClick={() => onOpen(program.id)}>
          <div className="metric-row">
            <span className="muted">{program.title}</span>
            {/* Ett fakta räcker i en lista: längden är det man jämför först. */}
            <strong>{weeksLabel(program.weeks)}</strong>
            <span className="chevron"><ChevronIcon /></span>
          </div>
        </button>
      ))}
    </section>
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
export function ProgramView({ date, programId, conversation, onClose, onOpenThread, onOpenProgram }: {
  date: Date;
  /** Programmet man tittar på, eller null för det man följer. */
  programId?: string | null;
  conversation: Conversation;
  onClose: () => void;
  onOpenThread: () => void;
  onOpenProgram: (id: string | null) => void;
}) {
  const [home, setHome] = useState<TrainingHome | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchTrainingHome(date)
      .then((result) => {
        if (cancelled) return;
        setHome(result);
        setLoaded(true);
      })
      .catch(() => !cancelled && setError("Programmet kunde inte hämtas just nu."));
    return () => { cancelled = true; };
  }, [date, attempt]);

  const assigned = home?.assigned_program ?? null;
  const available = home?.available_programs ?? [];
  // Programmet adressen pekar på, om det finns. Ett id som inte längre går att
  // välja faller tillbaka på det man följer i stället för på en tom sida.
  const chosen = programId
    ? available.find((entry) => entry.id === programId) ?? (assigned?.id === programId ? assigned : null)
    : null;
  const program = chosen ?? assigned;
  const following = program != null && assigned != null && program.id === assigned.id;
  const others = available.filter((entry) => entry.id !== program?.id);

  return (
    <div className="app-shell">
      <header className="thread-header">
        {/* Ur ett program man tittar på går vägen tillbaka till det man följer,
            inte hela vägen ut. Ett steg i taget, som överallt annars. */}
        <button className="thread-back" onClick={() => (chosen ? onOpenProgram(null) : onClose())}>
          <BackIcon /> {chosen ? "Tillbaka" : "Idag"}
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
      {/* Inget program följt och inget valt: meningen, och sedan listan. Utan
          program att välja bland är meningen allt som är sant. */}
      {loaded && !program && (
        <div className="hero">
          <p>
            {available.length > 0
              ? "Du följer inget program just nu. Välj ett nedan."
              : "Du följer inget program just nu."}
          </p>
          <span className="hero-rule" aria-hidden="true" />
        </div>
      )}

      {program && <Program program={program} />}

      {/* Följ-panelen bara för ett program man inte redan följer. */}
      {program && !following && (
        <Follow
          program={program}
          current={assigned}
          onFollowed={(next) => {
            setHome(next);
            onOpenProgram(null);
          }}
        />
      )}

      {loaded && <Others programs={others} onOpen={onOpenProgram} />}

      <CoachFloor conversation={conversation} onOpenThread={onOpenThread} inThread={false} />
    </div>
  );
}
