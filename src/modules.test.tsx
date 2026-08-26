import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DailyOverview } from "./daily";
import { NutritionModule } from "./modules";

function overview(exact: boolean): DailyOverview {
  return {
    date: "2026-08-26",
    headline: null,
    user: { first_name: "Casper" },
    calories: {
      can_calculate: true,
      goal: 2_000,
      goal_min: 1_800,
      goal_max: 2_200,
      consumed: 450,
      consumed_min: exact ? 450 : 390,
      consumed_max: exact ? 450 : 520,
      remaining: 1_550,
      is_over: false,
    },
    health: { steps: 0, step_goal: 7_000, active_calories: 0 },
    macros: { protein: 26, carbs: 81, fat: 12, protein_goal: 165, carbs_goal: null, fat_goal: null },
    meals: [{
      id: "meal-1",
      description: "Grekisk yoghurt med granola",
      calories: 450,
      calories_min: exact ? 450 : 390,
      calories_max: exact ? 450 : 520,
      logged_at: "2026-08-26T08:00:00Z",
    }],
    hydration: { consumed_ml: 1_750, goal_ml: 2_500 },
  };
}

describe("NutritionModule", () => {
  it("visar serverns osäkerhet och vätskemål", () => {
    const html = renderToStaticMarkup(
      <NutritionModule overview={overview(false)} onAddMeal={() => undefined} bindings={["daily.water"]} />,
    );

    expect(html).toContain("nutrition-range-uncertainty");
    expect(html).toContain("module-approx");
    expect(html).toContain(">ca</span>");
    expect(html).toContain("390–520");
    expect(html).toContain("Vätska");
    expect(html).toContain("av minst 2,5 l");
  });

  it("ritar inget osäkerhetsfält för ett exakt värde", () => {
    const html = renderToStaticMarkup(
      <NutritionModule overview={overview(true)} onAddMeal={() => undefined} />,
    );

    expect(html).not.toContain("nutrition-range-uncertainty");
    expect(html).not.toContain("module-approx");
  });
});
