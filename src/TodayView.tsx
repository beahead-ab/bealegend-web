import { useEffect, useState } from "react";
import { fetchDashboard, sections, WORDS, type DashboardConfig } from "./dashboard";
import { fetchOverview, heroSentence, type DailyOverview } from "./daily";

const SWEDISH = "sv-SE";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function MetricRow({ label, value, progress, onClick }: {
  label: string;
  value: string;
  progress?: number | null;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="metric-row">
        <span className="muted">{label}</span>
        <strong>{value}</strong>
        {onClick && <span className="chevron" aria-hidden="true">›</span>}
      </div>
      {progress != null && (
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${Math.min(Math.max(progress, 0), 1) * 100}%` }} />
        </div>
      )}
    </>
  );

  return onClick ? (
    <button className="metric-button" onClick={onClick}>{body}</button>
  ) : (
    <div>{body}</div>
  );
}

export function TodayView({ onSignOut }: { onSignOut: () => void }) {
  const [date, setDate] = useState(() => new Date());
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [error, setError] = useState("");

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

  const configured = config ? sections(config.widgets) : [];
  // The built-in surface always carries Träning, so a day with no configuration
  // still has a session to promise. Claiming one the surface does not show
  // would make the sentence a small lie.
  const showsTraining = configured.length === 0 || configured.some((section) => section.group === "Träning");

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
                <section className="card group-card" key={`${section.group}-${section.widgets[0].binding}`}>
                  <h2>{section.group}</h2>
                  {section.widgets.map((widget) => {
                    const word = WORDS[widget.binding];
                    const value = word.value(overview);
                    if (word.opensTraining) {
                      return (
                        <MetricRow
                          key={widget.binding}
                          label={word.title}
                          value=""
                          onClick={() => undefined}
                        />
                      );
                    }
                    if (value === null) return null;
                    return (
                      <MetricRow
                        key={widget.binding}
                        label={word.title}
                        value={value}
                        progress={widget.presentation === "horizontalBudget" ? word.progress?.(overview) : null}
                      />
                    );
                  })}
                </section>
              ))
            : <BuiltInSurface overview={overview} />}
        </>
      )}
    </div>
  );
}

/**
 * The surface as it is without a configuration — a first sign-in, an offline
 * start, or a dashboard describing nothing this build can draw. Not a safety
 * net bolted on: it is the answer for every account that has never touched
 * its dashboard.
 */
function BuiltInSurface({ overview }: { overview: DailyOverview }) {
  const calories = WORDS["daily.energyBudget"].value(overview);
  const protein = WORDS["daily.protein"].value(overview);

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
        <MetricRow label="Dagens pass" value="" onClick={() => undefined} />
      </section>
    </>
  );
}
