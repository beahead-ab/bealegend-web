import { useCallback, useEffect, useRef, useState } from "react";
import { CoachFloor } from "./CoachFloor";
import { CoachThread } from "./CoachThread";
import { SessionView } from "./SessionView";
import { useConversation } from "./conversation";
import {
  fetchDashboard,
  hiddenCount,
  sections,
  visibleWidgets,
  windowScopes,
  WORDS,
  type CountdownStatus,
  type DashboardConfig,
  type DashboardSection,
  type DashboardWidget,
} from "./dashboard";
import { fetchOverview, heroSentence, type DailyOverview } from "./daily";
import { fetchTrainingHome, isFinished, type TrainingRun } from "./training";
import { readRoute, routeSearch, sameRoute, type Route, type Surface } from "./route";
import { BackIcon, ChevronIcon } from "./icons";
import {
  addDays,
  coveringRange,
  fetchHistory,
  rangeFor,
  rangeLabel,
  type HistoryWindow,
} from "./history";
import { Countdown, ItemList, LineChart, MetricRow, RangeBar, Ring } from "./widgets";

const SWEDISH = "sv-SE";

/**
 * Where the tab is, kept in the address bar. sessionStorage remembered the
 * surface but not the day, so a reload while reading last Wednesday's pass
 * landed in the pass view showing today — half a memory. The URL carries both,
 * which also makes a reload, a shared link and the browser's back button work
 * without any code of ours holding the state.
 */
function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState(() => readRoute(window.location.search));

  useEffect(() => {
    const onPop = () => setRoute(readRoute(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((next: Route) => {
    // Read from the address bar rather than from state: it is the source of
    // truth here, and pushing history from inside a state updater would fire
    // twice under StrictMode and leave a duplicate entry to click back through.
    if (sameRoute(readRoute(window.location.search), next)) return;
    // pushState, so back returns to where they were rather than leaving the
    // app — the one thing the browser gives us that the app cannot.
    window.history.pushState(null, "", `${window.location.pathname}${routeSearch(next)}`);
    setRoute(next);
  }, []);

  return [route, go];
}

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString();
}

/** The same voice on every day, not only on this one. Saying "onsdag" in both
 *  the kicker and the heading made the heading add nothing — and "Idag." was
 *  then the one line in the surface with a voice, which vanished the moment you
 *  paged away from today. */
export function headingFor(date: Date, now = new Date()): string {
  if (date.toDateString() === now.toDateString()) return "Idag.";
  if (date.toDateString() === addDays(now, -1).toDateString()) return "Igår.";
  if (date.toDateString() === addDays(now, 1).toDateString()) return "I morgon.";
  return `${date.toLocaleDateString(SWEDISH, { day: "numeric", month: "long" })}.`;
}

/**
 * §2: the date owns the left edge, and today is always default and always one
 * click away.
 */
function DayHeader({
  date,
  move,
  goToToday,
  onSignOut,
  name,
  runActive,
  atFuture,
}: {
  date: Date;
  move: (days: number) => void;
  goToToday: () => void;
  onSignOut: () => void;
  name: string | null | undefined;
  runActive: boolean;
  atFuture: boolean;
}) {
  const today = isToday(date);
  return (
    <header className="app-header">
      <div>
        <div className="kicker">{date.toLocaleDateString(SWEDISH, { weekday: "long" })}</div>
        <h1>{headingFor(date)}</h1>
      </div>

      <button className="icon-button" onClick={() => move(-1)} aria-label="Föregående dag"><BackIcon size={16} /></button>
      <button className="icon-button" onClick={() => move(1)} aria-label="Nästa dag" disabled={atFuture}><ChevronIcon size={16} /></button>
      {!today && <button className="pill" onClick={goToToday}>Till idag</button>}

      <div className="header-actions">
        <AccountMenu name={name} runActive={runActive} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

function initials(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "·";
}

/**
 * Signing out used to be a 34 px glyph on the same row as the day arrows, and it
 * signed you out on the press. That is the argument I made myself about "Kasta
 * passet" — a destructive action must not sit beside one you press often —
 * applied in the wrong place. Mid-pass, the mis-tap costs the whole session.
 *
 * It now lives behind the account, and asks while a run is going.
 */
function AccountMenu({ name, runActive, onSignOut }: {
  name: string | null | undefined;
  runActive: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => { if (!open) setConfirming(false); }, [open]);

  return (
    <div className="account" ref={box}>
      <button
        className="account-mark"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Konto"
      >
        {initials(name)}
      </button>

      {open && (
        <div className="account-menu" role="menu">
          {confirming ? (
            <>
              <p className="account-question">
                {runActive ? "Ett pass pågår. Logga ut ändå?" : "Logga ut?"}
              </p>
              <button className="account-item" onClick={() => setOpen(false)}>Stanna kvar</button>
              <button className="account-item danger" onClick={onSignOut}>Logga ut</button>
            </>
          ) : (
            <button className="account-item" onClick={() => setConfirming(true)}>Logga ut</button>
          )}
        </div>
      )}
    </div>
  );
}

export function TodayView({ onSignOut }: { onSignOut: () => void }) {
  // Three surfaces, one at a time. The conversation lives above all of them,
  // so moving between them never ends it.
  const [route, go] = useRoute();
  const { date, surface } = route;
  const setSurface = (next: Surface) => go({ ...route, surface: next });
  const setDate = (next: Date) => go({ ...route, date: next });
  // Owned here, above both surfaces: leaving the thread must not end the
  // conversation, which is the whole point of §3.3's ongoing state.
  const conversation = useConversation();
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [history, setHistory] = useState<HistoryWindow | null>(null);
  const [activeRun, setActiveRun] = useState<TrainingRun | null>(null);
  const [error, setError] = useState("");

  // Only to know whether a pass is running. Saying "Dagens pass" while one is
  // in progress would be the surface's own small lie.
  useEffect(() => {
    let cancelled = false;
    fetchTrainingHome(date)
      .then((home) => !cancelled && setActiveRun(home.active_run))
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [date]);

  // Bumped to retry: the same fetch, run again, without a reload. Mid-pass,
  // "load the page again" is the most expensive instruction the surface can give.
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError("");
    fetchOverview(date)
      .then((result) => !cancelled && setOverview(result))
      // The day already on screen is kept. Emptying the surface on a failed
      // refresh throws away something correct in exchange for nothing.
      .catch(() => !cancelled && setError("Dagen kunde inte hämtas just nu."));
    return () => { cancelled = true; };
  }, [date, attempt]);

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

  // A client that often has a keyboard should be usable with one. Esc closes
  // whichever surface is open, which is what every other app on the machine does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never while typing: the arrows belong to the caret then.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") setDate(addDays(date, -1));
      if (event.key === "ArrowRight" && !atFuture) setDate(addDays(date, 1));
      if (event.key === "Escape" && surface !== "today") setSurface("today");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Six things, then a word. The configuration may hold eight; a home screen
  // that opens with all of them is the crowding §6 removed.
  const configured = config ? sections(visibleWidgets(config.widgets, expanded)) : [];
  const behindMore = config ? hiddenCount(config.widgets) : 0;
  // The built-in surface always carries Träning, so a day with no configuration
  // still has a session to promise. Claiming one the surface does not show
  // would make the sentence a small lie.
  const showsTraining = configured.length === 0 || configured.some((section) => section.group === "Träning");
  const runningLabel = activeRun && !isFinished(activeRun) ? "Pågår" : "";
  // Tomorrow is as far as the day surface can honestly go: a diary has nothing
  // to show for a day that has not happened, and every step there costs three
  // requests to find that out.
  const atFuture = date.toDateString() === addDays(new Date(), 1).toDateString();

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
    <div className="app-shell day-shell">
      <DayHeader
        date={date}
        move={(days) => setDate(addDays(date, days))}
        goToToday={() => setDate(new Date())}
        onSignOut={onSignOut}
        name={overview?.user.first_name}
        runActive={!!activeRun && !isFinished(activeRun)}
        atFuture={atFuture}
      />

      {error && (
        <div className="error-message" role="status">
          <span>{error}</span>
          <button className="pill" onClick={() => setAttempt((n) => n + 1)}>Försök igen</button>
        </div>
      )}

      {!overview && !error && <DaySkeleton />}

      {overview && (
        <>
          <div className="hero">
            <p>{heroSentence(overview, showsTraining)}</p>
            <span className="hero-rule" aria-hidden="true" />
          </div>

          {configured.length > 0
            ? (
              <>
                {configured.map((section) => (
                  <Card
                    key={`${section.group}-${section.widgets[0].binding}`}
                    section={section}
                    overview={overview}
                    history={history}
                    date={date}
                    countdowns={config?.countdowns ?? []}
                    openTraining={() => setSurface("session")}
                    runningLabel={runningLabel}
                  />
                ))}
                {behindMore > 0 && !expanded && (
                  <button className="quiet-button centred show-more" onClick={() => setExpanded(true)}>
                    Visa mer ({behindMore})
                  </button>
                )}
                {expanded && behindMore > 0 && (
                  <button className="quiet-button centred show-more" onClick={() => setExpanded(false)}>
                    Visa mindre
                  </button>
                )}
              </>
            )
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
 * The day before it arrives. Not a spinner and not a shimmer: a card in the
 * height the real one will take, so nothing jumps when the answer lands and the
 * first impression is a page loading rather than a page broken.
 */
function DaySkeleton() {
  return (
    <>
      <div className="hero">
        <div className="skeleton-line long" />
        <span className="hero-rule" aria-hidden="true" />
      </div>
      {["Näring", "Träning"].map((group) => (
        <section className="card group-card" key={group}>
          <h2>{group}</h2>
          <div className="skeleton-line short" />
          <div className="skeleton-line short" />
        </section>
      ))}
    </>
  );
}

/**
 * A group's card, drawn only once something inside it has something to say. A
 * card whose words are all still waiting on their window — or whose window
 * never arrived — is a heading over nothing, which reads as a surface that
 * broke rather than one that is honest about what it does not know.
 */
function Card({ section, overview, history, date, countdowns, openTraining, runningLabel }: {
  section: DashboardSection;
  overview: DailyOverview;
  history: HistoryWindow | null;
  date: Date;
  countdowns: CountdownStatus[];
  openTraining: () => void;
  runningLabel: string;
}) {
  const drawn = section.widgets
    .map((widget) => {
      const body = drawWidget(widget, overview, history, date, countdowns, openTraining, runningLabel, section.hero);
      return body === null ? null : <div key={widget.binding}>{body}</div>;
    })
    .filter((node) => node !== null);

  if (drawn.length === 0) return null;

  // A hero keeps the group's name as a quiet line rather than a heading: the
  // thing itself is the heading at that size.
  return (
    <section className={section.hero ? "card group-card hero-card" : "card group-card"}>
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
  countdowns: CountdownStatus[],
  openTraining: () => void,
  runningLabel: string,
  hero = false,
) {
  const word = WORDS[widget.binding];
  const range = rangeFor(widget.scope, date);
  const needsWindow = word.source === "window";

  if (needsWindow && !history) return null;

  switch (widget.presentation) {
    case "rangeBar": {
      const reading = word.range?.(overview);
      if (!reading) return null;
      return <RangeBar label={word.title} reading={reading} hero={hero} />;
    }
    case "countdown": {
      // The server computed it or it is not drawn. A client that derived pace
      // from the widget's own goal would be a second answer to the same
      // question, and the whole point is that there is one.
      const status = countdowns.find((entry) => entry.binding === widget.binding);
      if (!status) return null;
      // The unit belongs to the word being measured — "4" is not an answer to
      // how much is left, and only the measured word knows it is kilos.
      const unit = widget.measure ? WORDS[widget.measure]?.unit : undefined;
      return <Countdown status={status} unit={unit} hero={hero} />;
    }
    case "ring": {
      const progress = word.progress?.(overview);
      if (progress == null) return null;
      return <Ring label={word.title} value={word.value?.(overview, history, range) ?? ""} progress={progress} />;
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
      const value = word.value?.(overview, history, range);
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
