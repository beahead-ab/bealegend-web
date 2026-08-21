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

const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * A goal drawn as the share of it that is done. The arc is clamped to a full
 * turn while the percentage is not: passing a goal is worth seeing, and a ring
 * that silently stops at 100 % hides it.
 */
export function Ring({ label, value, progress }: { label: string; value: string; progress: number }) {
  const filled = Math.min(Math.max(progress, 0), 1);
  const percent = Math.round(progress * 100);
  const over = progress > 1;

  return (
    <div className="ring-widget">
      <svg viewBox="0 0 64 64" className="ring" role="img" aria-label={`${label}: ${percent} procent`}>
        <circle className="ring-track" cx="32" cy="32" r={RING_RADIUS} />
        <circle
          className={over ? "ring-fill over" : "ring-fill"}
          cx="32"
          cy="32"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
        />
        <text x="32" y="32" className="ring-label">{percent}%</text>
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

function chartPoints(series: SeriesPoint[]): string {
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const usable = CHART_HEIGHT - CHART_PADDING * 2;

  return series
    .map((point, index) => {
      const x = series.length === 1
        ? CHART_WIDTH / 2
        : (index / (series.length - 1)) * CHART_WIDTH;
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
        {series.length === 1 && <circle className="chart-dot" cx={CHART_WIDTH / 2} cy={CHART_HEIGHT / 2} r="3" />}
      </svg>
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
