import { describe, expect, it } from "vitest";
import { fetchedLabel, forget, memoryStore, recall, remember, type Remembered } from "./lastKnown";
import type { DailyOverview } from "./daily";

function overview(date: string, steps = 0): DailyOverview {
  return {
    date,
    headline: null,
    user: { first_name: "Casper" },
    calories: { can_calculate: true, goal: 2400, consumed: 0, remaining: 2400, is_over: false },
    health: { steps, step_goal: 10000, active_calories: 0 },
    macros: { protein: 0, carbs: 0, fat: 0, protein_goal: null, carbs_goal: null, fat_goal: null },
    meals: [],
  };
}

const AT = Date.UTC(2026, 7, 23, 5, 12);

describe("den sist kända dagen", () => {
  it("kommer tillbaka som den skrevs", () => {
    const store = memoryStore();
    remember("2026-08-23", overview("2026-08-23", 4200), AT, store);

    const kept = recall("2026-08-23", store);

    expect(kept?.at).toBe(AT);
    expect(kept?.overview.health.steps).toBe(4200);
  });

  it("svarar null för en dag som aldrig hämtats", () => {
    expect(recall("2026-08-01", memoryStore())).toBe(null);
  });

  /** Den som bläddrar bakåt i ett år ska inte fylla webbläsarens kvot med tal
   *  ingen kommer att läsa utan nät. */
  it("håller sju dagar, de närmast i tiden", () => {
    const store = memoryStore();
    for (let day = 1; day <= 10; day += 1) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      remember(iso, overview(iso), AT, store);
    }

    expect(Object.keys(store.read()).sort()).toEqual([
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
    ]);
  });

  /** En uppdatering av en gammal dag får inte tränga ut dagarna kring idag. */
  it("gallrar efter vilken dag raden beskriver, inte när den skrevs", () => {
    const store = memoryStore();
    for (let day = 4; day <= 10; day += 1) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      remember(iso, overview(iso), AT, store);
    }

    remember("2026-07-01", overview("2026-07-01"), AT + 60_000, store);

    expect(recall("2026-07-01", store)).toBe(null);
    expect(recall("2026-08-10", store)?.overview.date).toBe("2026-08-10");
  });

  it("skriver över samma dag i stället för att lägga till en rad", () => {
    const store = memoryStore();
    remember("2026-08-23", overview("2026-08-23", 100), AT, store);
    remember("2026-08-23", overview("2026-08-23", 900), AT + 3_600_000, store);

    expect(Object.keys(store.read())).toHaveLength(1);
    expect(recall("2026-08-23", store)?.overview.health.steps).toBe(900);
  });

  /** Måtten hör till en person. Nästa som loggar in på samma dator ska inte
   *  kunna läsa dem. */
  it("glöms vid utloggning", () => {
    const store = memoryStore();
    remember("2026-08-23", overview("2026-08-23"), AT, store);

    forget(store);

    expect(recall("2026-08-23", store)).toBe(null);
  });

  /** En rad från ett äldre bygge är inte värd att gissa på. */
  it("avvisar en lagrad form som inte går att lita på", () => {
    const store = memoryStore({
      "2026-08-23": { at: "igår" } as unknown as Remembered,
    });

    expect(recall("2026-08-23", store)).toBe(null);
  });
});

describe("raden som säger hur färsk dagen är", () => {
  it("nöjer sig med klockslaget samma dag", () => {
    const at = new Date(2026, 7, 23, 7, 12).getTime();
    const now = new Date(2026, 7, 23, 11, 0).getTime();

    expect(fetchedLabel(at, now)).toBe("Senast hämtat 07:12");
  });

  /** Klockslaget ensamt hade lästs som i morse, vilket är det enda raden
   *  finns för att förhindra. */
  it("nämner dagen när den inte är denna", () => {
    const at = new Date(2026, 7, 22, 21, 40).getTime();
    const now = new Date(2026, 7, 23, 8, 0).getTime();

    expect(fetchedLabel(at, now)).toBe("Senast hämtat 22 aug. 21:40");
  });
});
