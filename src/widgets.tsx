import { ChevronIcon } from "./icons";
import type { ListItem, SeriesPoint } from "./dashboard";

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

function chartNumber(value: number, unit?: string): string {
  const text = value.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

  return (
    <div className="chart-widget">
      <div className="chart-heading">
        <span className="muted">{label}</span>
        <span className="chart-range">{range}</span>
      </div>
      <div className="chart-figures">
        <strong>{chartNumber(latest, unit)}</strong>
        {series.length > 1 && (
          // Neutral on purpose: whether a falling weight is progress depends on
          // what the user is doing, and colouring it green or red would have the
          // surface take a side it has no way of knowing.
          <span className="chart-change">{change > 0 ? "+" : ""}{chartNumber(change, unit)}</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="chart"
        role="img"
        aria-label={`${label}, ${range}: från ${chartNumber(first, unit)} till ${chartNumber(latest, unit)}`}
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
        <span>lägst {chartNumber(Math.min(...values), unit)}</span>
        <span>högst {chartNumber(Math.max(...values), unit)}</span>
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
