import { useEffect, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import { CoachThread } from "./CoachThread";
import { SessionView } from "./SessionView";
import { useConversation } from "./conversation";
import {
  fetchDashboard,
  sections,
  windowScopes,
  WORDS,
  type DashboardConfig,
  type DashboardSection,
  type DashboardWidget,
} from "./dashboard";
import { fetchOverview, heroSentence, type DailyOverview } from "./daily";
import { fetchTrainingHome, isFinished, type TrainingRun } from "./training";
import {
  addDays,
  coveringRange,
  fetchHistory,
  rangeFor,
  rangeLabel,
  type HistoryWindow,
} from "./history";
import { ItemList, LineChart, MetricRow, Ring } from "./widgets";

const SWEDISH = "sv-SE";

type Surface = "today" | "session" | "thread";

const SURFACE_KEY = "bal.surface";

function rememberedSurface(): Surface {
  try {
    const stored = window.sessionStorage.getItem(SURFACE_KEY);
    // The thread is not remembered: it is a conversation you left, and landing
    // back in it would hide the day you reloaded to see.
    return stored === "session" ? "session" : "today";
  } catch {
    return "today";
  }
}

function rememberSurface(surface: Surface) {
  try {
    window.sessionStorage.setItem(SURFACE_KEY, surface);
  } catch {
    // Nothing is lost that matters; the tab simply forgets where it was.
  }
}

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

/**
 * §2: the date owns the left edge. "Idag." only when it is actually today —
 * otherwise the weekday and a way back, so today is always default and always
 * one click away.
 */
function DayHeader({
  date,
  move,
  goToToday,
  onSignOut,
}: {
  date: Date;
  move: (days: number) => void;
  goToToday: () => void;
  onSignOut: () => void;
}) {
  const today = isToday(date);
  return (
    <header className="app-header">
      <div>
        <div className="kicker">
          {date.toLocaleDateString(SWEDISH, { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1>{today ? "Idag." : date.toLocaleDateString(SWEDISH, { weekday: "long" })}</h1>
      </div>

      <button className="icon-button" onClick={() => move(-1)} aria-label="Föregående dag">‹</button>
      <button className="icon-button" onClick={() => move(1)} aria-label="Nästa dag">›</button>
      {!today && <button className="pill" onClick={goToToday}>Till idag</button>}

      <div className="header-actions">
        <button className="icon-button" onClick={onSignOut} title="Logga ut" aria-label="Logga ut">⏻</button>
      </div>
    </header>
  );
}

export function TodayView({ onSignOut }: { onSignOut: () => void }) {
  const [date, setDate] = useState(() => new Date());
  // Three surfaces, one at a time. The conversation lives above all of them,
  // so moving between them never ends it.
  //
  // Remembered per tab: a reload mid-pass has to come back to the pass, not to
  // Idag. Per tab and not per browser on purpose — a tab opened fresh to check
  // the day's calories should land on the day, not be thrown into a run.
  const [surface, setSurface] = useState<Surface>(rememberedSurface);
  // Owned here, above both surfaces: leaving the thread must not end the
  // conversation, which is the whole point of §3.3's ongoing state.
  const conversation = useConversation();
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [history, setHistory] = useState<HistoryWindow | null>(null);
  const [activeRun, setActiveRun] = useState<TrainingRun | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { rememberSurface(surface); }, [surface]);

  // Only to know whether a pass is running. Saying "Dagens pass" while one is
  // in progress would be the surface's own small lie.
  useEffect(() => {
    let cancelled = false;
    fetchTrainingHome(date)
      .then((home) => !cancelled && setActiveRun(home.active_run))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchOverview(date)
      .then((result) => !cancelled && setOverview(result))
      .catch(() => !cancelled && setError("Dagen kunde inte hämtas."));
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    // A dashboard that cannot be fetched costs personalisation, never the
    // screen — the built-in surface below is what runs then.
    fetchDashboard()
      .then((result) => !cancelled && setConfig(result))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // One request covers every window word on the surface, and a surface with
  // none pays for nothing.
  useEffect(() => {
    const range = coveringRange(config ? windowScopes(config.widgets) : [], date);
    if (!range) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    fetchHistory(range)
      .then((result) => !cancelled && setHistory(result))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [config, date]);

  const configured = config ? sections(config.widgets) : [];
  // The built-in surface always carries Träning, so a day with no configuration
  // still has a session to promise. Claiming one the surface does not show
  // would make the sentence a small lie.
  const showsTraining = configured.length === 0 || configured.some((section) => section.group === "Träning");
  const runningLabel = activeRun && !isFinished(activeRun) ? "Pågår" : "";

  if (surface === "thread") {
    return <CoachThread conversation={conversation} onClose={() => setSurface("today")} />;
  }

  if (surface === "session") {
    return (
      <SessionView
        date={date}
        conversation={conversation}
        onClose={() => setSurface("today")}
        onOpenThread={() => setSurface("thread")}
      />
    );
  }

  return (
    <div className="app-shell">
      <DayHeader
        date={date}
        move={(days) => setDate((current) => addDays(current, days))}
        goToToday={() => setDate(new Date())}
        onSignOut={onSignOut}
      />

      {error && <p className="error-message">{error}</p>}

      {overview && (
        <>
          <div className="hero">
            <p>{heroSentence(overview, showsTraining)}</p>
            <span className="hero-rule" aria-hidden="true" />
          </div>

          {configured.length > 0
            ? configured.map((section) => (
                <Card
                  key={`${section.group}-${section.widgets[0].binding}`}
                  section={section}
                  overview={overview}
                  history={history}
                  date={date}
                  openTraining={() => setSurface("session")}
                  runningLabel={runningLabel}
                />
              ))
            : (
              <BuiltInSurface
                overview={overview}
                openTraining={() => setSurface("session")}
                runningLabel={runningLabel}
              />
            )}
        </>
      )}

      <CoachFloor conversation={conversation} onOpenThread={() => setSurface("thread")} inThread={false} />
    </div>
  );
}

/**
 * A group's card, drawn only once something inside it has something to say. A
 * card whose words are all still waiting on their window — or whose window
 * never arrived — is a heading over nothing, which reads as a surface that
 * broke rather than one that is honest about what it does not know.
 */
function Card({ section, overview, history, date, openTraining, runningLabel }: {
  section: DashboardSection;
  overview: DailyOverview;
  history: HistoryWindow | null;
  date: Date;
  openTraining: () => void;
  runningLabel: string;
}) {
  const drawn = section.widgets
    .map((widget) => {
      const body = drawWidget(widget, overview, history, date, openTraining, runningLabel);
      return body === null ? null : <div key={widget.binding}>{body}</div>;
    })
    .filter((node) => node !== null);

  if (drawn.length === 0) return null;

  return (
    <section className="card group-card">
      <h2>{section.group}</h2>
      {drawn}
    </section>
  );
}

/**
 * One configured word, drawn in the form the configuration asked for. Every
 * branch may decline: a word whose window has not arrived yet draws nothing
 * rather than an empty frame that fills in a moment later.
 */
function drawWidget(
  widget: DashboardWidget,
  overview: DailyOverview,
  history: HistoryWindow | null,
  date: Date,
  openTraining: () => void,
  runningLabel: string,
) {
  const word = WORDS[widget.binding];
  const range = rangeFor(widget.scope, date);
  const needsWindow = word.source === "window";

  if (needsWindow && !history) return null;

  switch (widget.presentation) {
    case "ring": {
      const progress = word.progress?.(overview);
      if (progress == null) return null;
      return <Ring label={word.title} value={word.value?.(overview) ?? ""} progress={progress} />;
    }
    case "lineChart":
      return (
        <LineChart
          label={word.title}
          series={word.series?.(history as HistoryWindow, range) ?? []}
          unit={word.unit}
          range={rangeLabel(widget.scope)}
          empty={word.empty ?? "Inget att visa än."}
        />
      );
    case "list":
      return (
        <ItemList
          label={word.title}
          items={word.items?.(overview, history, range) ?? []}
          empty={word.empty ?? "Inget att visa än."}
        />
      );
    default: {
      if (word.opensTraining) {
        return <MetricRow label={word.title} value={runningLabel} onClick={openTraining} />;
      }
      const value = word.value?.(overview);
      if (value == null) return null;
      return (
        <MetricRow
          label={word.title}
          value={value}
          progress={widget.presentation === "horizontalBudget" ? word.progress?.(overview) : null}
        />
      );
    }
  }
}

/**
 * The surface as it is without a configuration — a first sign-in, an offline
 * start, or a dashboard describing nothing this build can draw. Not a safety
 * net bolted on: it is the answer for every account that has never touched
 * its dashboard.
 */
function BuiltInSurface({ overview, openTraining, runningLabel }: {
  overview: DailyOverview;
  openTraining: () => void;
  runningLabel: string;
}) {
  const calories = WORDS["daily.energyBudget"].value?.(overview);
  const protein = WORDS["daily.protein"].value?.(overview);

  return (
    <>
      <section className="card group-card">
        <h2>Näring</h2>
        {calories && (
          <MetricRow
            label="Kalorier"
            value={calories}
            progress={WORDS["daily.energyBudget"].progress?.(overview)}
          />
        )}
        {protein && <MetricRow label="Protein" value={protein} />}
      </section>
      <section className="card group-card">
        <h2>Träning</h2>
        <MetricRow label="Dagens pass" value={runningLabel} onClick={openTraining} />
      </section>
    </>
  );
}
