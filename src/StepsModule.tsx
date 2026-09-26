import type { DailyOverview } from "./daily";
import { movementSummary } from "./dailyMovement";
import { Ring } from "./widgets";

/** Same daily.steps binding and actual measurements as iOS; no browser pedometer. */
export function StepsModule({ overview, presentation = "metricRow" }: {
  overview: DailyOverview;
  presentation?: "metricRow" | "ring";
}) {
  const summary = movementSummary(overview);
  return (
    <div className="steps-module">
      {presentation === "ring" ? (
        <Ring
          label="Steg"
          value={`${summary.stepText} steg`}
          progress={summary.steps !== null && summary.goal !== null ? summary.steps / summary.goal : null}
          empty={summary.steps === null}
        />
      ) : (
        <>
          <div className="module-eyebrow">Steg</div>
          <div className="module-hero" aria-label={summary.steps === null ? "Inga steg uppmätta" : `${summary.stepText} steg`}>
            <strong>{summary.stepText}</strong><span>steg</span>
          </div>
        </>
      )}
      {summary.steps === null && <p className="steps-caption muted">Inga steg uppmätta</p>}
      {summary.goalText && <p className="steps-caption muted">{summary.goalText}</p>}
      <p className="steps-distance muted">{summary.distanceText}</p>
    </div>
  );
}
