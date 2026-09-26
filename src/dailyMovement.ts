import { healthMeasured, swedishNumber, type DailyOverview } from "./daily";

export function measuredSteps(overview: DailyOverview): number | null {
  const health = overview.health;
  const measured = health.steps_measured_at === undefined
    ? healthMeasured(overview) && health.steps > 0
    : health.steps_measured_at !== null && Number.isFinite(Date.parse(health.steps_measured_at));
  return measured && Number.isSafeInteger(health.steps) && health.steps >= 0 ? health.steps : null;
}

export function movementSummary(overview: DailyOverview) {
  const steps = measuredSteps(overview);
  const rawDistance = overview.health.distance_km;
  const distanceKm = typeof rawDistance === "number" && Number.isFinite(rawDistance) && rawDistance >= 0
    ? rawDistance : null;
  const goal = Number.isSafeInteger(overview.health.step_goal) && overview.health.step_goal > 0
    ? overview.health.step_goal : null;
  return {
    steps, distanceKm, goal,
    stepText: steps === null ? "—" : swedishNumber(steps),
    goalText: goal === null ? null : `Mål ${swedishNumber(goal)} steg`,
    distanceText: distanceKm === null ? "Sträcka saknas"
      : `Sträcka: ${distanceKm.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} km`,
  };
}
