import { useCallback, useEffect, useRef, useState } from "react";
import { ChangeReceipt } from "./ChangeReceipt";
import { CoachFloor } from "./CoachFloor";
import { CoachThread } from "./CoachThread";
import { PlanView } from "./PlanView";
import { ProgramView } from "./ProgramView";
import { SessionView } from "./SessionView";
import { useConversation } from "./conversation";
import {
  fetchDashboard,
  fetchDashboardList,
  fetchDashboardSeries,
  hiddenCount,
  NUTRITION_GROUP,
  resourceKey,
  resourceWidgets,
  mergeNutrition,
  sections,
  visibleWidgets,
  WORDS,
  type CountdownStatus,
  type DashboardConfig,
  type DashboardResource,
  type DashboardSection,
  type DashboardWidget,
} from "./dashboard";
import {
  dayOnScreen,
  fetchOverview,
  heroSentence,
  isoDate,
  nothingMeasured,
  type DailyOverview,
} from "./daily";
import { fetchTrainingHome, isFinished, type TrainingRun } from "./training";
import { fetchedLabel, recallConfig, recallDay, rememberConfig, rememberDay } from "./lastKnown";
import type { SignedInUser } from "./api";
import { readRoute, routeSearch, sameRoute, type Route, type Surface } from "./route";
import { BackIcon, ChevronIcon } from "./icons";
import { addDays, rangeLabel } from "./history";
import { Countdown, ItemList, LineChart, MetricRow, RangeBar, Ring } from "./widgets";
import { NutritionModule } from "./modules";

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
  openPlan,
}: {
  date: Date;
  move: (days: number) => void;
  goToToday: () => void;
  onSignOut: () => void;
  name: string | null | undefined;
  runActive: boolean;
  atFuture: boolean;
  openPlan: () => void;
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

      {/* Idag och Planen är två ytor (beslut #78). Dagen bär vägen dit;
          Planen bär vägen tillbaka. */}
      <button className="pill" onClick={openPlan}>Planen</button>

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

export function TodayView({ onSignOut, user, preview }: {
  onSignOut: () => void;
  user?: SignedInUser;
  preview?: DailyOverview;
}) {
  // Nothing is remembered for a session we cannot attribute. Failing closed
  // costs a refetch; the alternative is one person's day in a store the next
  // person could read.
  const userId = user?.id;
  // Three surfaces, one at a time. The conversation lives above all of them,
  // so moving between them never ends it.
  const [route, go] = useRoute();
  const { date, surface } = route;
  const setSurface = (next: Surface) => go({ ...route, surface: next });
  const setDate = (next: Date) => go({ ...route, date: next });
  // A meal written through the conversation changes the day immediately. The
  // thread stays open while the fresh overview is fetched, so leaving it never
  // reveals the numbers from before the action.
  const [attempt, setAttempt] = useState(0);
  const refreshDayAfterMeal = useCallback(() => setAttempt((current) => current + 1), []);
  /**
   * Var programsidan stängs till. En direktöppnad eller omladdad programsida
   * har ingen förälder och stänger till Idag; öppnad ur ett pass stänger den
   * tillbaka till passet.
   *
   * Nollställs när programsidan stängs. Ett returmål som låg kvar efteråt hade
   * följt med till nästa gång man öppnade ett pass — och då hade passets egen
   * tillbakaknapp pekat på passet självt, alltså inte gjort någonting.
   */
  const [programReturnSurface, setProgramReturnSurface] = useState<"today" | "session">("today");
  // Owned here, above both surfaces: leaving the thread must not end the
  // conversation, which is the whole point of §3.3's ongoing state.
  const conversation = useConversation(refreshDayAfterMeal);

  /**
   * En yta som vill be om något lägger meningen i samtalet och öppnar tråden.
   *
   * Skickar aldrig själv. Användaren läser vad som står och trycker — det är
   * skillnaden mellan ett förslag och en handling någon annan utförde i ens
   * namn.
   */
  const askInThread = (sentence: string) => {
    conversation.setDraft(sentence);
    setSurface("thread");
  };
  const [overview, setOverview] = useState<DailyOverview | null>(preview ?? null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [resources, setResources] = useState<Record<string, DashboardResource>>({});
  const [activeRun, setActiveRun] = useState<TrainingRun | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState("");
  /**
   * When the day on screen was fetched, or null while it is current. Set only
   * when the server could not be reached and a remembered day was drawn
   * instead — the surface must never look fresher than it is.
   */
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  // Only to know whether a pass is running. Saying "Dagens pass" while one is
  // in progress would be the surface's own small lie.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    // Cleared first. "Pågår" and the pass shortcut belong to the day they were
    // read for, and leaving them up while another day loads is the surface
    // saying something true about yesterday as though it were about today.
    setActiveRun(null);
    setHasSession(false);
    fetchTrainingHome(date)
      .then((home) => {
        if (cancelled) return;
        setActiveRun(home.active_run);
        setHasSession(home.today_sessions.length > 0);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [date, preview]);

  // Bumped to retry: the same fetch, run again, without a reload. Mid-pass,
  // "load the page again" is the most expensive instruction the surface can give.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const iso = isoDate(date);
    setError("");
    // The day on screen goes before the new one is asked for. Keeping it would
    // draw one date's numbers under another's heading for as long as the
    // request takes — and for good, if it fails and nothing is cached.
    setOverview(null);
    setFetchedAt(null);
    setExpanded(false);
    fetchOverview(date)
      .then((result) => {
        if (cancelled) return;
        setOverview(result);
        setFetchedAt(null);
        // Written only from a real answer, so what is replayed later was true
        // when it was written.
        if (userId) rememberDay(userId, iso, result);
      })
      // Never an empty page. The last day the server answered with is drawn
      // instead, with the hour it was fetched — freshness is what a lost
      // connection costs, not the surface. Only a day nobody has ever fetched
      // falls through to the message.
      .catch(() => {
        if (cancelled) return;
        // This date's own answer or none. A neighbouring day is not a worse
        // version of this one — it is a different one.
        const kept = userId ? recallDay(userId, iso) : null;
        if (kept) {
          setOverview(kept.overview);
          setFetchedAt(kept.at);
          return;
        }
        setError("Dagen kunde inte hämtas just nu.");
      });
    return () => { cancelled = true; };
  }, [date, attempt, userId, preview]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    // The remembered shape first, so an offline start draws the user's own
    // surface rather than the built-in one. It is replaced the moment a real
    // answer arrives; a dashboard that cannot be fetched costs personalisation,
    // never the screen.
    if (userId) {
      const kept = recallConfig(userId);
      if (kept) setConfig(kept);
    }
    fetchDashboard()
      .then((result) => {
        if (cancelled) return;
        setConfig(result);
        if (userId) rememberConfig(userId, result);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [userId, preview]);

  // Servern äger fönster, datapunkter och listornas radtak. Ytan frågar därför
  // efter exakt de resurser konfigurationen använder och räknar inte om dem.
  useEffect(() => {
    const widgets = resourceWidgets(config?.widgets ?? []);
    if (widgets.length === 0) { setResources({}); return; }
    let cancelled = false;
    setResources({});
    Promise.all(widgets.map(async (widget) => {
      try {
        const source = WORDS[widget.binding].source;
        const result = source === "series"
          ? await fetchDashboardSeries(widget.binding, widget.scope)
          : await fetchDashboardList(widget.binding, widget.scope);
        return [resourceKey(widget.binding, widget.scope), result] as const;
      } catch {
        // En trasig kurva får inte ta med sig en fungerande lista. Varje
        // resurs är en självständig del av ytan och får falla bort ensam.
        return null;
      }
    }))
      .then((entries) => {
        if (!cancelled) setResources(Object.fromEntries(entries.filter((entry) => entry !== null)));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [config]);

  // A client that often has a keyboard should be usable with one. Esc closes
  // whichever surface is open, which is what every other app on the machine does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never while typing: the arrows belong to the caret then.
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") setDate(addDays(date, -1));
      if (event.key === "ArrowRight" && !atFuture) setDate(addDays(date, 1));
      if (event.key === "Escape" && surface !== "today") {
        if (surface === "program") {
          setSurface(programReturnSurface);
          setProgramReturnSurface("today");
        } else {
          setSurface("today");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /**
   * The day, but only if it is this day.
   *
   * Every path above already clears on a date change, and this is what holds
   * if one ever stops: a stored answer filed wrong, a response that lands after
   * the user has paged on. The heading says which date this is, and nothing
   * below it may describe another one.
   */
  const shownDay = dayOnScreen(overview, isoDate(date));

  // Six things, then a word. The configuration may hold eight; a home screen
  // that opens with all of them is the crowding §6 removed.
  // Näringen slås ihop till en modul innan något ritas. Se mergeNutrition.
  const configured = config ? mergeNutrition(sections(visibleWidgets(config.widgets, expanded))) : [];
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
        onOpenProgram={() => {
          setProgramReturnSurface("session");
          // Utan program-id: passet öppnar det man följer, inte det man
          // senast tittade på.
          go({ ...route, surface: "program", program: null });
        }}
      />
    );
  }

  if (surface === "plan") {
    return (
      <PlanView
        conversation={conversation}
        onClose={() => setSurface("today")}
        onOpenThread={() => setSurface("thread")}
        onOpenProgram={() => setSurface("program")}
        onOpenSession={(day) => go({ date: day, surface: "session" })}
      />
    );
  }

  if (surface === "program") {
    return (
      <ProgramView
        date={date}
        programId={route.program}
        conversation={conversation}
        onClose={() => {
          setSurface(programReturnSurface);
          setProgramReturnSurface("today");
        }}
        onOpenThread={() => setSurface("thread")}
        // Programmet bärs i adressen, så en sida man tittar på går att skicka.
        onOpenProgram={(id) => go({ ...route, surface: "program", program: id })}
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
        name={shownDay?.user.first_name}
        runActive={!!activeRun && !isFinished(activeRun)}
        atFuture={atFuture}
        openPlan={() => setSurface("plan")}
      />

      {error && (
        <div className="error-message" role="status">
          <span>{error}</span>
          <button className="pill" onClick={() => setAttempt((n) => n + 1)}>Försök igen</button>
        </div>
      )}

      {/* Begins with what works, per the design target's copy rule: the day is
          here, and it is from this morning. The retry sits at the end, where
          it is an offer rather than an instruction. */}
      {fetchedAt != null && (
        <div className="stale-line" role="status">
          <span className="muted">{fetchedLabel(fetchedAt)}</span>
          <button className="quiet-button" onClick={() => setAttempt((n) => n + 1)}>Hämta igen</button>
        </div>
      )}

      {!shownDay && !error && <DaySkeleton />}

      {shownDay && (
        <>
          <div className="hero">
            <p>{heroSentence(shownDay, showsTraining)}</p>
          </div>

          {/* Under hero-meningen, över korten: där ögat redan är när ytan ser
              annorlunda ut än i går. Ritar ingenting när ingenting ändrats. */}
          <ChangeReceipt onUndone={(next) => {
            setConfig(next);
            if (userId) rememberConfig(userId, next);
          }} />

          {configured.length > 0
            ? (
              <>
                {configured.map((section) => (
                  section.group === NUTRITION_GROUP ? (
                    <NutritionModule
                      key={`${section.group}-${section.widgets[0].binding}`}
                      overview={shownDay}
                      onAddMeal={() => setSurface("thread")}
                      bindings={section.widgets.map((widget) => widget.binding)}
                    />
                  ) : (
                    <Card
                      key={`${section.group}-${section.widgets[0].binding}`}
                      section={section}
                      overview={shownDay}
                      resources={resources}
                      countdowns={config?.countdowns ?? []}
                      openTraining={() => setSurface("session")}
                      runningLabel={runningLabel}
                      onAsk={askInThread}
                    />
                  )
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
                overview={shownDay}
                openThread={() => setSurface("thread")}
                openTraining={() => setSurface("session")}
                runningLabel={runningLabel}
              />
            )}

          {!atFuture && nothingMeasured(shownDay) && (
            <WaysIn
              hasSession={hasSession}
              openThread={() => setSurface("thread")}
              openTraining={() => setSurface("session")}
            />
          )}
        </>
      )}

      <CoachFloor conversation={conversation} onOpenThread={() => setSurface("thread")} inThread={false} />
    </div>
  );
}

/**
 * A day with nothing measured on it — somebody's first, or a Tuesday nobody has
 * touched yet. The forms above are already drawn empty; this says what to do
 * about it, and offers only what this client can actually carry out.
 *
 * Nothing here is required, and nothing here is a form. The conversation is the
 * editor, so the way in is to say something — and the pass is offered only on a
 * day that has one, because a button that opens an empty pass is worse than no
 * button.
 */
function WaysIn({ hasSession, openThread, openTraining }: {
  hasSession: boolean;
  openThread: () => void;
  openTraining: () => void;
}) {
  return (
    <section className="card ways-in">
      <p>Ingenting mätt än i dag.</p>
      <p className="muted">Berätta vad du ätit eller gjort, så för Legend in det.</p>
      <div className="ways-in-actions">
        <button className="pill" onClick={openThread}>Berätta för Legend</button>
        {hasSession && (
          <button className="quiet-button" onClick={openTraining}>Dagens pass</button>
        )}
      </div>
    </section>
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
function Card({ section, overview, resources, countdowns, openTraining, runningLabel, onAsk }: {
  section: DashboardSection;
  overview: DailyOverview;
  resources: Record<string, DashboardResource>;
  countdowns: CountdownStatus[];
  openTraining: () => void;
  runningLabel: string;
  /** Vägen till samtalet för en ruta som vill be om något. Se askInThread. */
  onAsk: (sentence: string) => void;
}) {
  const drawn = section.widgets
    .map((widget) => {
      const body = drawWidget(widget, overview, resources, countdowns, openTraining, runningLabel, onAsk, section.hero);
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
  resources: Record<string, DashboardResource>,
  countdowns: CountdownStatus[],
  openTraining: () => void,
  runningLabel: string,
  onAsk: (sentence: string) => void,
  hero = false,
) {
  const word = WORDS[widget.binding];
  const resource = resources[resourceKey(widget.binding, widget.scope)];
  const needsResource = word.source !== "day";

  if (needsResource && !resource) return null;

  // Silence, not absence. A word that measured nothing keeps its place and
  // draws its empty form; a word that cannot be drawn at all still returns
  // null below and leaves no trace.
  const measured = word.measured ? word.measured(overview) : true;

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
      // Och ordet självt, så att kvittots meningar säger vilket mål de rör.
      const subject = widget.measure ? WORDS[widget.measure]?.title : undefined;
      return <Countdown status={status} unit={unit} subject={subject} hero={hero} onAsk={onAsk} />;
    }
    case "ring": {
      const progress = word.progress?.(overview);
      const value = word.value?.(overview);
      if (value == null) return null;
      return (
        <Ring
          label={word.title}
          value={value}
          progress={progress ?? null}
          empty={!measured}
        />
      );
    }
    case "lineChart":
      return (
        <LineChart
          label={word.title}
          series={resource?.schema_version === "dashboard-series.v1" ? word.series?.(resource) ?? [] : []}
          unit={word.unit}
          range={rangeLabel(widget.scope)}
          empty={word.empty ?? "Inget att visa än."}
        />
      );
    case "list":
      return (
        <ItemList
          label={word.title}
          items={word.items?.(
            overview,
            resource?.schema_version === "dashboard-list.v1" ? resource : undefined,
          ) ?? []}
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
          empty={!measured}
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
function BuiltInSurface({ overview, openThread, openTraining, runningLabel }: {
  overview: DailyOverview;
  openThread: () => void;
  openTraining: () => void;
  runningLabel: string;
}) {
  return (
    <>
      <NutritionModule overview={overview} onAddMeal={openThread} />
      <section className="card group-card">
        <h2>Träning</h2>
        <MetricRow label="Dagens pass" value={runningLabel} onClick={openTraining} />
      </section>
    </>
  );
}
