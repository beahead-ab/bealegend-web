import { beforeEach, describe, expect, it } from "vitest";
import {
  browserStore,
  claim,
  fetchedLabel,
  forget,
  memoryStore,
  recallConfig,
  recallDay,
  rememberConfig,
  rememberDay,
} from "./lastKnown";
import type { DailyOverview } from "./daily";
import type { DashboardConfig } from "./dashboard";

const CASPER = "user-casper";
const ANNAN = "user-annan";

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

const config = (binding: string): DashboardConfig => ({
  schema_version: "dashboard.v1",
  revision: 3,
  widgets: [{ binding, scope: "today", presentation: "metricRow", size: "small" }],
});

const AT = Date.UTC(2026, 7, 23, 5, 12);

describe("den sist kända dagen", () => {
  it("kommer tillbaka som den skrevs", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 4200), AT, store);

    const kept = recallDay(CASPER, "2026-08-23", store);

    expect(kept?.at).toBe(AT);
    expect(kept?.overview.health.steps).toBe(4200);
  });

  it("svarar null för en dag som aldrig hämtats", () => {
    expect(recallDay(CASPER, "2026-08-01", memoryStore())).toBe(null);
  });

  /** Den som bläddrar bakåt i ett år ska inte fylla webbläsarens kvot med tal
   *  ingen kommer att läsa utan nät. */
  it("håller sju dagar, de närmast i tiden", () => {
    const store = memoryStore();
    for (let day = 1; day <= 10; day += 1) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      rememberDay(CASPER, iso, overview(iso), AT, store);
    }

    expect(Object.keys(store.read()!.days).sort()).toEqual([
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
      rememberDay(CASPER, iso, overview(iso), AT, store);
    }

    rememberDay(CASPER, "2026-07-01", overview("2026-07-01"), AT + 60_000, store);

    expect(recallDay(CASPER, "2026-07-01", store)).toBe(null);
    expect(recallDay(CASPER, "2026-08-10", store)?.overview.date).toBe("2026-08-10");
  });

  it("skriver över samma dag i stället för att lägga till en rad", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 100), AT, store);
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 900), AT + 3_600_000, store);

    expect(Object.keys(store.read()!.days)).toHaveLength(1);
    expect(recallDay(CASPER, "2026-08-23", store)?.overview.health.steps).toBe(900);
  });

  /** En rad som hamnat under fel nyckel ska inte ritas under ett datum den
   *  aldrig beskrev. */
  it("avvisar en rad vars dag inte är dagen den ligger under", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-22"), AT, store);

    expect(recallDay(CASPER, "2026-08-23", store)).toBe(null);
  });
});

/**
 * Det här är inte en cachedetalj utan hela poängen: måtten tillhör en person,
 * och webbläsaren kan delas.
 */
describe("cachen tillhör ett konto", () => {
  it("visar aldrig en annan användares dag", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 4200), AT, store);

    expect(recallDay(ANNAN, "2026-08-23", store)).toBe(null);
  });

  /** Att bara neka hade lämnat raderna kvar. Läsningen städar. */
  it("raderar den andres rader vid första läsningen", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23"), AT, store);

    recallDay(ANNAN, "2026-08-23", store);

    expect(store.read()).toBe(null);
  });

  it("städar vid kontobyte, före första läsningen", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23"), AT, store);

    claim(ANNAN, store);

    expect(store.read()).toBe(null);
    expect(recallDay(CASPER, "2026-08-23", store)).toBe(null);
  });

  it("lämnar egna rader i fred när samma konto återvänder", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 4200), AT, store);

    claim(CASPER, store);

    expect(recallDay(CASPER, "2026-08-23", store)?.overview.health.steps).toBe(4200);
  });

  /** En utgången session är en session som tagit slut. */
  it("glöms vid utloggning och utgången session", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23"), AT, store);

    forget(store);

    expect(store.read()).toBe(null);
    expect(recallDay(CASPER, "2026-08-23", store)).toBe(null);
  });

  it("skriver den andres rader över, inte bredvid", () => {
    const store = memoryStore();
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 4200), AT, store);

    rememberDay(ANNAN, "2026-08-23", overview("2026-08-23", 11), AT, store);

    expect(store.read()!.userId).toBe(ANNAN);
    expect(recallDay(ANNAN, "2026-08-23", store)?.overview.health.steps).toBe(11);
    expect(recallDay(CASPER, "2026-08-23", store)).toBe(null);
  });
});

describe("den sist kända ytan", () => {
  it("kommer tillbaka så att en dag utan nät ser ut som användarens egen", () => {
    const store = memoryStore();
    rememberConfig(CASPER, config("health.weight"), AT, store);

    expect(recallConfig(CASPER, store)?.widgets[0].binding).toBe("health.weight");
  });

  it("tillhör samma konto som dagarna", () => {
    const store = memoryStore();
    rememberConfig(CASPER, config("health.weight"), AT, store);

    expect(recallConfig(ANNAN, store)).toBe(null);
  });

  it("överlever att dagarna gallras", () => {
    const store = memoryStore();
    rememberConfig(CASPER, config("health.weight"), AT, store);
    for (let day = 1; day <= 10; day += 1) {
      const iso = `2026-08-${String(day).padStart(2, "0")}`;
      rememberDay(CASPER, iso, overview(iso), AT, store);
    }

    expect(recallConfig(CASPER, store)?.widgets[0].binding).toBe("health.weight");
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

/**
 * Mot den lagring som faktiskt skeppas, inte mot attrappen. Isoleringen mellan
 * konton är det enda i den här filen som är ett säkerhetskrav, och den ska
 * prövas i den kod som kör hos användaren.
 */
describe("den riktiga webbläsarlagringen", () => {
  beforeEach(() => window.localStorage.clear());

  it("håller isär två konton, och lämnar ingenting kvar", () => {
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23", 4200), AT, browserStore());
    expect(window.localStorage.getItem("bal.days")).toContain("4200");

    expect(recallDay(ANNAN, "2026-08-23", browserStore())).toBe(null);

    expect(window.localStorage.getItem("bal.days")).toBe(null);
  });

  it("städar vid kontobyte", () => {
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23"), AT, browserStore());

    claim(ANNAN, browserStore());

    expect(window.localStorage.getItem("bal.days")).toBe(null);
  });

  it("glöms vid utloggning", () => {
    rememberDay(CASPER, "2026-08-23", overview("2026-08-23"), AT, browserStore());

    forget(browserStore());

    expect(window.localStorage.getItem("bal.days")).toBe(null);
  });

  /** En lagrad form utan ägare är från ett äldre bygge och läses inte alls. */
  it("avvisar en lagring utan ägare", () => {
    window.localStorage.setItem("bal.days", JSON.stringify({ "2026-08-23": { at: AT, overview: overview("2026-08-23") } }));

    expect(recallDay(CASPER, "2026-08-23", browserStore())).toBe(null);
  });

  it("överlever skräp i lagringen", () => {
    window.localStorage.setItem("bal.days", "{inte json");

    expect(recallDay(CASPER, "2026-08-23", browserStore())).toBe(null);
  });
});
