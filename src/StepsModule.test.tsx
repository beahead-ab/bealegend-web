import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayOnScreen, type DailyOverview } from "./daily";
import { movementSummary } from "./dailyMovement";
import { StepsModule } from "./StepsModule";
import { WORDS } from "./dashboard";

const measuredAt = "2026-09-12T12:00:00Z";
const day = (health: Partial<DailyOverview["health"]> = {}): DailyOverview => ({
  date: "2026-09-12", headline: null, user: { first_name: null },
  calories: { can_calculate: false, goal: 0, consumed: 0, remaining: 0, is_over: false },
  macros: { protein: 0, carbs: 0, fat: 0, protein_goal: null, carbs_goal: null, fat_goal: null },
  meals: [], health: { steps: 0, step_goal: 7_000, active_calories: 0, ...health },
});

describe("steg först, sträcka sekundärt", () => {
  it.each(["metricRow", "ring"] as const)("ritar båda mätningarna i %s", (presentation) => {
    const html = renderToStaticMarkup(<StepsModule presentation={presentation} overview={day({
      steps: 4_331, steps_measured_at: measuredAt, distance_km: 3.21,
    })} />);
    expect(html).toContain("4 331");
    expect(html).toContain("Sträcka: 3,21 km");
    expect(html.indexOf("4 331")).toBeLessThan(html.indexOf("Sträcka:"));
    expect(html).toContain("Mål 7 000 steg");
  });

  it("skiljer uppmätt noll från ingen mätning", () => {
    expect(movementSummary(day({ steps_measured_at: measuredAt, distance_km: 0 }))).toMatchObject({
      steps: 0, stepText: "0", distanceText: "Sträcka: 0 km",
    });
    const empty = day({ measured_at: measuredAt, steps_measured_at: null, distance_km: null });
    expect(movementSummary(empty)).toMatchObject({ steps: null, stepText: "—", distanceText: "Sträcka saknas" });
    const html = renderToStaticMarkup(<StepsModule overview={empty} />);
    expect(html).toContain("Inga steg uppmätta");
    expect(html).not.toContain('aria-label="0 steg"');
    expect(html).not.toContain("<strong>0</strong>");
    expect(WORDS["daily.steps"].measured?.(empty)).toBe(false);
    expect(WORDS["daily.steps"].progress?.(empty)).toBeNull();
  });

  it("är bakåtkompatibel utan att låta kalorier eller sömn bevisa noll steg", () => {
    expect(movementSummary(day({ steps: 42 })).steps).toBe(42);
    expect(movementSummary(day({ active_calories: 40, sleep_minutes: 400, measured_at: measuredAt })).steps).toBeNull();
    expect(movementSummary(day({ steps: 42, measured_at: null })).steps).toBeNull();
    expect(movementSummary(day({ steps: 42, steps_measured_at: null })).steps).toBeNull();
  });

  it("härleder aldrig sträcka från steg eller steg från sträcka", () => {
    expect(movementSummary(day({ steps: 10_000 })).distanceKm).toBeNull();
    expect(movementSummary(day({ steps_measured_at: null, distance_km: 4.2 }))).toMatchObject({ steps: null, distanceKm: 4.2 });
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("visar inte ogiltig sträcka %s", (distance_km) => {
    expect(movementSummary(day({ distance_km })).distanceKm).toBeNull();
  });

  it("saknat mål är inte noll procent, och ogiltiga steg är ingen mätning", () => {
    const overview = day({ steps: 100, step_goal: 0 });
    const html = renderToStaticMarkup(<StepsModule presentation="ring" overview={overview} />);
    expect(html).not.toContain("0%");
    expect(html).not.toContain("Mål");
    expect(movementSummary(day({ steps: -1, steps_measured_at: measuredAt })).steps).toBeNull();
    expect(movementSummary(day({ steps: 10, steps_measured_at: "not-a-date" })).steps).toBeNull();
  });

  it("följer datumet i dagsvaret, aldrig en separat nutidsmätning", () => {
    const old = day({ steps: 600, distance_km: 0.48 });
    expect(dayOnScreen(old, "2026-09-13")).toBeNull();
    expect(movementSummary(dayOnScreen(old, "2026-09-12")!).steps).toBe(600);
  });
});
