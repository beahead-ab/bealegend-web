import { ChevronIcon } from "./icons";
import { hoursAndMinutes, type CountdownStatus, type ListItem, type RangeReading, type SeriesPoint } from "./dashboard";

/** A home surface is not a workspace (DASHBOARD_LANGUAGE.md). A list that grows
 *  without a ceiling turns the one into the other, so it says how many are left
 *  rather than showing them all. */
const MAX_LIST_ROWS = 5;

export function MetricRow({ label, value, progress, onClick }: {
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
        {onClick && <span className="chevron"><ChevronIcon /></span>}
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

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The second lap, drawn just outside the first. Thin and in the same blue,
 * because its job is to show that a goal was passed — not to say how that felt.
 *
 * Outside rather than inside: an inner lap at this size crosses the label, and
 * a three-digit percentage sat right on top of it. Outside also reads the way
 * the thing it describes happened — past the goal, not within it.
 */
const LAP_RADIUS = 31.5;

/**
 * Wider than the ring needs, to leave room outside it. At the old 64 the lap
 * had nowhere to sit that was not touching the ring, and a lap flush against
 * it reads as a thicker ring rather than as a second turn.
 */
const RING_BOX = 72;
const RING_CENTRE = RING_BOX / 2;
const LAP_CIRCUMFERENCE = 2 * Math.PI * LAP_RADIUS;

/**
 * A goal drawn as the share of it that is done. The arc is clamped to a full
 * turn while the percentage is not: passing a goal is worth seeing, and a ring
 * that silently stops at 100 % hides it.
 *
 * Going over used to turn the ring red, which reads as a fault. For calories
 * that may be right; for protein and steps 112 % is a good day. Whether
 * passing a goal is good depends on what the user is doing, and the surface
 * has no way of knowing — the same reason the weight chart's change is
 * colourless. So the overshoot gets a second, thinner lap in the same blue:
 * visible, and silent about whether it is welcome.
 *
 * Direction belongs to the word, not to the drawing. If it is ever wanted it
 * goes on the binding in the server's vocabulary, where it would reach iOS too.
 */
export function Ring({ label, value, progress }: { label: string; value: string; progress: number }) {
  const filled = Math.min(Math.max(progress, 0), 1);
  const percent = Math.round(progress * 100);
  // A second lap at most: three times the goal and twice the goal should look
  // alike, because the number above already says which it was.
  const lap = Math.min(Math.max(progress - 1, 0), 1);

  return (
    <div className="ring-widget">
      <svg
        viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
        className="ring"
        role="img"
        aria-label={`${label}: ${percent} procent`}
      >
        <circle className="ring-track" cx={RING_CENTRE} cy={RING_CENTRE} r={RING_RADIUS} />
        <circle
          className="ring-fill"
          cx={RING_CENTRE}
          cy={RING_CENTRE}
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
        />
        {lap > 0 && (
          <circle
            className="ring-lap"
            cx={RING_CENTRE}
            cy={RING_CENTRE}
            r={LAP_RADIUS}
            strokeDasharray={LAP_CIRCUMFERENCE}
            strokeDashoffset={LAP_CIRCUMFERENCE * (1 - lap)}
          />
        )}
        <text x={RING_CENTRE} y={RING_CENTRE} className="ring-label">{percent}%</text>
      </svg>
      <div className="ring-text">
        <span className="muted">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 84;
const CHART_PADDING = 8;
const CHART_INSET = 4;

function chartPoints(series: SeriesPoint[]): string {
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usable = CHART_HEIGHT - CHART_PADDING * 2;

  return series
    .map((point, index) => {
      // Inset by the dot's radius: drawn to the very edge, half the marker on
      // the newest reading falls outside the viewBox and is clipped away.
      const x = series.length === 1
        ? CHART_WIDTH / 2
        : CHART_INSET + (index / (series.length - 1)) * (CHART_WIDTH - CHART_INSET * 2);
      // A week where the weight never moved is a flat line through the middle,
      // not a division by zero and not a jump to the top of the box.
      const y = span === 0
        ? CHART_HEIGHT / 2
        : CHART_PADDING + (1 - (point.value - min) / span) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** One decimal, always. A scale that prints 86 next to 84,2 reads as two
 *  different measurements rather than two ends of one. */
/** Where the newest reading sits, read back out of the same geometry the line
 *  is drawn from so the dot cannot drift off it. */
function latestPoint(series: SeriesPoint[]): { x: number; y: number } {
  const last = chartPoints(series).split(" ").pop() ?? "0,0";
  const [x, y] = last.split(",").map(Number);
  return { x, y };
}

/** Just the day and month: the year is the same as the window, and repeating
 *  it in both ends would crowd the one line the reader is here for. */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

/**
 * One precision per scale, decided by the data. Weight is measured in tenths,
 * so its scale prints 84,2 next to 86,0 — never a bare 86, which would read as
 * a different measurement. A pulse is whole beats, and "52,0 slag/min" would
 * be false precision. Every number on one chart follows the same rule.
 */
function chartDecimals(series: SeriesPoint[]): number {
  return series.every((point) => Number.isInteger(point.value)) ? 0 : 1;
}

function chartNumber(value: number, decimals: number, unit?: string): string {
  const text = value.toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return unit ? `${text} ${unit}` : text;
}

/**
 * A series over the window the surface actually fetched. [range] is drawn rather
 * than implied, because the web cannot honour `sinceGoalStart` literally — a
 * chart that named no dates would let the reader assume it starts where the
 * goal did.
 */
export function LineChart({ label, series, unit, range, empty }: {
  label: string;
  series: SeriesPoint[];
  unit?: string;
  range: string;
  empty: string;
}) {
  if (series.length === 0) {
    return (
      <div className="chart-widget">
        <div className="chart-heading"><span className="muted">{label}</span><span className="chart-range">{range}</span></div>
        <p className="chart-empty">{empty}</p>
      </div>
    );
  }

  const values = series.map((point) => point.value);
  const latest = series[series.length - 1].value;
  const first = series[0].value;
  const change = latest - first;
  const decimals = chartDecimals(series);

  return (
    <div className="chart-widget">
      <div className="chart-heading">
        <span className="muted">{label}</span>
        <span className="chart-range">{range}</span>
      </div>
      <div className="chart-figures">
        <strong>{chartNumber(latest, decimals, unit)}</strong>
        {series.length > 1 && (
          // Neutral on purpose: whether a falling weight is progress depends on
          // what the user is doing, and colouring it green or red would have the
          // surface take a side it has no way of knowing.
          <span className="chart-change">{change > 0 ? "+" : ""}{chartNumber(change, decimals, unit)}</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="chart"
        role="img"
        aria-label={`${label}, ${range}: från ${chartNumber(first, decimals, unit)} till ${chartNumber(latest, decimals, unit)}`}
      >
        <polyline className="chart-line" points={chartPoints(series)} vectorEffect="non-scaling-stroke" />
        {/* A dot on the newest reading, so the latest measurement is findable
            on the line and not only in the figure above it. */}
        <circle className="chart-dot" cx={latestPoint(series).x} cy={latestPoint(series).y} r="3.2" />
      </svg>
      {/* The x-axis was anonymous: a point could be yesterday or three weeks
          ago. A date at each end is enough to place the line without turning
          it into a charting tool. */}
      <div className="chart-days" aria-hidden="true">
        <span>{dayLabel(series[0].date)}</span>
        <span>{dayLabel(series[series.length - 1].date)}</span>
      </div>
      {/* Named rather than bare. Two numbers at the ends of a line read as its
          start and finish, which is what they are not — the left one is the
          lowest point, and here it happens to be the newest. */}
      <div className="chart-bounds" aria-hidden="true">
        <span>lägst {chartNumber(Math.min(...values), decimals, unit)}</span>
        <span>högst {chartNumber(Math.max(...values), decimals, unit)}</span>
      </div>
    </div>
  );
}

export function ItemList({ label, items, empty }: { label: string; items: ListItem[]; empty: string }) {
  const shown = items.slice(0, MAX_LIST_ROWS);
  const rest = items.length - shown.length;

  return (
    <div className="list-widget">
      <div className="list-heading"><span className="muted">{label}</span></div>
      {shown.length === 0 ? (
        <p className="list-empty">{empty}</p>
      ) : (
        <ul>
          {shown.map((item) => (
            <li key={item.id}>
              <span className="list-label">{item.label}</span>
              <span className="list-detail">{item.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {rest > 0 && <p className="list-more">+{rest} till</p>}
    </div>
  );
}

/**
 * An interval: a measurement against the floor and ceiling the user set. The
 * band is drawn from their own goal and never from an opinion about what a
 * night should be — that distinction is the whole reason this form exists
 * rather than a second goal ring.
 *
 * With no goal set the scale is dashed and the marker still sits where the
 * measurement fell. The empty state has its own form, and inventing a band to
 * fill it would make the surface state something the user never said.
 */
export function RangeBar({ label, reading, hero = false }: {
  label: string;
  reading: RangeReading;
  hero?: boolean;
}) {
  const hasBand = reading.min != null || reading.max != null;
  // The scale spans the goal with room on both sides, and the padding never
  // shrinks below two hours: a narrow window would otherwise push a night well
  // outside it onto the very edge, where being far outside and being just
  // outside look the same.
  const low = reading.min ?? reading.max ?? 0;
  const high = reading.max ?? reading.min ?? 0;
  const pad = Math.max(high - low, 120);
  const from = low - pad;
  const to = high + pad;
  const place = (value: number) => ((value - from) / (to - from)) * 100;
  const clamp = (percent: number) => Math.min(Math.max(percent, 0), 100);

  return (
    <div className={hero ? "range-widget hero-widget" : "range-widget"}>
      <div className="metric-row">
        <span className="muted">{label}</span>
        <strong>{reading.text}</strong>
      </div>
      <div className={hasBand ? "range-track" : "range-track no-goal"} aria-hidden="true">
        {hasBand && (
          <span
            className="range-band"
            style={{
              left: `${clamp(place(reading.min ?? from))}%`,
              width: `${clamp(place(reading.max ?? to) - place(reading.min ?? from))}%`,
            }}
          />
        )}
        {reading.value != null && (
          <span className="range-marker" style={{ left: `${clamp(place(reading.value))}%` }} />
        )}
      </div>
      <p className="range-caption muted">{caption(reading, hasBand)}</p>
    </div>
  );
}

/** The line under the bar. With nothing measured it names the window and stops
 *  — repeating "inget mätt i natt" under a value that already says so would be
 *  the surface talking to itself. */
function caption(reading: RangeReading, hasBand: boolean): string {
  if (!hasBand) return "Inget sömnfönster satt än.";
  const window = `${hoursAndMinutes(reading.min ?? 0)}–${hoursAndMinutes(reading.max ?? 0)}`;
  return reading.band ? `${reading.band} · ${window}` : `Ditt fönster: ${window}`;
}

const COUNTDOWN_WORDS: Record<string, string> = {
  on_track: "I takt",
  ahead: "I hamn",
  behind: "Efter takten",
  passed: "Datumet har passerat",
  date_only: "Räknar dagar",
  no_measurements: "Inget mätt än",
};

function swedishDate(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

function paceText(status: CountdownStatus, unit?: string): string | null {
  if (status.pace_required_per_week == null) return null;
  const required = Math.abs(status.pace_required_per_week);
  const way = (status.pace_required_per_week < 0 ? "ned" : "upp");
  return `${amount(required, unit)} i veckan ${way}`;
}

/** A bare number is not an answer to "how much is left". The unit comes from
 *  the word being measured, which is the only place that knows it. */
function amount(value: number, unit?: string): string {
  const text = value.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  return unit ? `${text} ${unit}` : text;
}

/**
 * The countdown, drawn from numbers the server computed. Three things it
 * always says when it can: how long is left, what pace that requires, and when
 * the current pace would arrive — as a band rather than a date, because a
 * single date would claim a precision the measurements do not have.
 *
 * A passed deadline is its own state and gets said out loud. The design target
 * is explicit that the date must not slip by in silence, so the widget stays
 * and reports rather than quietly resetting itself.
 */
export function Countdown({ status, unit, hero = false }: {
  status: CountdownStatus;
  unit?: string;
  hero?: boolean;
}) {
  const days = status.days_left;
  const passed = status.status === "passed";
  const headline = status.status === "passed"
    ? swedishDate(status.deadline)
    : `${Math.max(days, 0).toLocaleString("sv-SE")} ${Math.abs(days) === 1 ? "dag" : "dagar"}`;
  // A passed date has no pace left to keep and no arrival to predict. What it
  // has is a result and a question, and both are said below.
  const pace = passed ? null : paceText(status, unit);
  const band = !passed && status.projected_arrival_early && status.projected_arrival_late
    ? (status.projected_arrival_early === status.projected_arrival_late
        ? swedishDate(status.projected_arrival_early)
        : `${swedishDate(status.projected_arrival_early)} – ${swedishDate(status.projected_arrival_late)}`)
    : null;

  return (
    <div className={hero ? "countdown-widget hero-widget" : "countdown-widget"}>
      <div className="metric-row">
        <span className="muted">{status.title}</span>
        <strong>{headline}</strong>
      </div>
      <p className="countdown-state">{COUNTDOWN_WORDS[status.status] ?? ""}</p>
      <dl className="countdown-facts">
        {!passed && (
          <div>
            <dt className="muted">Till</dt>
            <dd>{swedishDate(status.deadline)}</dd>
          </div>
        )}
        {status.remaining != null && status.remaining > 0 && (
          <div>
            <dt className="muted">{passed ? "Saknades" : "Kvar"}</dt>
            <dd>{amount(status.remaining, unit)}</dd>
          </div>
        )}
        {pace && (
          <div>
            <dt className="muted">Takt som krävs</dt>
            <dd>{pace}</dd>
          </div>
        )}
        {band && (
          <div>
            <dt className="muted">Framme</dt>
            <dd>{band}</dd>
          </div>
        )}
      </dl>
      {passed && (
        <p className="range-caption muted">Säg till i samtalet om du vill sätta ett nytt datum.</p>
      )}
      {status.status === "no_measurements" && (
        <p className="range-caption muted">Ingen mätning att räkna takt ur än.</p>
      )}
      {!passed && status.status === "behind" && status.projected_arrival == null && status.pace_per_week != null && (
        <p className="range-caption muted">Takten går åt andra hållet, så ingen prognos ges.</p>
      )}
    </div>
  );
}
