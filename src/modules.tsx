import type { ReactNode } from "react";
import { FLOOR_STOP, RANGE_STOP, percent, rangePosition, type RangeScale } from "./rangeScale";
import { swedishNumber, type DailyOverview, type Meal } from "./daily";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="module-eyebrow">{children}</div>;
}

export function HeroNumber({ value, unit, caption, approximate = false }: {
  value: number;
  unit: string;
  caption?: string;
  approximate?: boolean;
}) {
  return (
    <div className="module-hero">
      {approximate && <span className="module-approx">ca</span>}
      <strong>{swedishNumber(value)}</strong>
      <span>{unit}</span>
      {caption && <span className="module-hero-caption">{caption}</span>}
    </div>
  );
}

export function RangeBar({ scale, value, valueRange }: {
  scale: RangeScale;
  value: number | null;
  valueRange?: { min: number; max: number } | null;
}) {
  return (
    <div
      className="nutrition-range"
      aria-label={value == null
        ? "Inget värde loggat"
        : valueRange && valueRange.max > valueRange.min
          ? `${swedishNumber(value)}, uppskattat spann ${swedishNumber(valueRange.min)} till ${swedishNumber(valueRange.max)}`
          : swedishNumber(value)}
    >
      <span className="nutrition-range-track" />
      {value == null ? (
        <span className="nutrition-range-dashed nutrition-range-empty" />
      ) : (
        <>
          <span className="nutrition-range-dashed nutrition-range-under" style={{ width: percent(FLOOR_STOP) }} />
          <span
            className="nutrition-range-target"
            style={{ left: percent(FLOOR_STOP), width: percent(RANGE_STOP - FLOOR_STOP) }}
          />
          <span className="nutrition-range-dashed nutrition-range-over" style={{ left: percent(RANGE_STOP) }} />
          {valueRange && valueRange.max > valueRange.min && (
            <span
              className="nutrition-range-uncertainty"
              style={{
                left: percent(rangePosition(scale, valueRange.min)),
                width: percent(rangePosition(scale, valueRange.max) - rangePosition(scale, valueRange.min)),
              }}
            />
          )}
          <span className="nutrition-range-marker" style={{ left: percent(rangePosition(scale, value)) }} />
        </>
      )}
    </div>
  );
}

function Macro({ label, value, goal }: { label: string; value: number; goal: number | null }) {
  return (
    <div className="macro-value">
      <span>{label}</span>
      <strong>{swedishNumber(value)} g</strong>
      {goal != null && goal > 0 && <small>av {swedishNumber(goal)} g</small>}
    </div>
  );
}

function MealRow({ meal }: { meal: Meal }) {
  const time = new Date(meal.logged_at).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="meal-row">
      <time>{time}</time>
      <span>{meal.description?.trim() || "Måltid"}</span>
      <strong>
        {swedishNumber(meal.calories)} kcal
        {meal.calories_min != null && meal.calories_max != null && meal.calories_max > meal.calories_min && (
          <small>{swedishNumber(meal.calories_min)}–{swedishNumber(meal.calories_max)}</small>
        )}
      </strong>
    </div>
  );
}

export function NutritionModule({
  overview,
  onAddMeal,
  bindings,
}: {
  overview: DailyOverview;
  onAddMeal: () => void;
  bindings?: string[];
}) {
  const minimum = overview.calories.goal_min ?? overview.calories.goal;
  const maximum = overview.calories.goal_max ?? overview.calories.goal;
  const hasRange = overview.calories.can_calculate && maximum > minimum && minimum > 0;
  const meals = (overview.meals ?? []).slice(-5);
  const minimumConsumed = overview.calories.consumed_min ?? overview.calories.consumed;
  const maximumConsumed = overview.calories.consumed_max ?? overview.calories.consumed;
  const hasUncertainty = maximumConsumed > minimumConsumed;
  const showsWater = bindings == null || bindings.includes("daily.water");

  return (
    <section className="nutrition-module" aria-labelledby="nutrition-heading">
      <Eyebrow>Näring</Eyebrow>
      <h2 id="nutrition-heading" className="visually-hidden">Näring idag</h2>
      {hasRange ? (
        <>
          <HeroNumber
            value={overview.calories.consumed}
            unit="kcal"
            caption={`av ${swedishNumber(minimum)}–${swedishNumber(maximum)}`}
            approximate={hasUncertainty}
          />
          <RangeBar
            scale={{ floor: minimum, ceiling: maximum }}
            value={overview.calories.consumed}
            valueRange={hasUncertainty ? { min: minimumConsumed, max: maximumConsumed } : null}
          />
        </>
      ) : overview.calories.can_calculate ? (
        <HeroNumber
          value={overview.calories.consumed}
          unit="kcal"
          caption={overview.calories.goal > 0 ? `av ${swedishNumber(overview.calories.goal)}` : undefined}
        />
      ) : (
        <p className="module-empty">Logga dagens första måltid för att börja se dagen.</p>
      )}

      <div className="macro-grid">
        <Macro label="Protein" value={overview.macros.protein} goal={overview.macros.protein_goal} />
        <Macro label="Kolhydrater" value={overview.macros.carbs} goal={overview.macros.carbs_goal} />
        <Macro label="Fett" value={overview.macros.fat} goal={overview.macros.fat_goal} />
      </div>

      {showsWater && overview.hydration && (
        <div className="hydration-row">
          <span>Vätska</span>
          <strong>{liters(overview.hydration.consumed_ml)} l</strong>
          {overview.hydration.goal_ml != null && overview.hydration.goal_ml > 0 && (
            <small>av minst {liters(overview.hydration.goal_ml)} l</small>
          )}
        </div>
      )}

      <div className="meal-card">
        <div className="meal-card-head">
          <Eyebrow>Måltider</Eyebrow>
          <span>{meals.length}</span>
        </div>
        {meals.length > 0 ? meals.map((meal) => <MealRow key={meal.id} meal={meal} />) : (
          <p className="meal-empty">Inget loggat ännu.</p>
        )}
        <button type="button" className="meal-add" onClick={onAddMeal}>
          <span aria-hidden="true">＋</span> Lägg till måltid i chatten
        </button>
      </div>
    </section>
  );
}

function liters(milliliters: number): string {
  return (milliliters / 1_000).toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}
