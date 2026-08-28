import { describe, expect, it } from "vitest";
import {
  equipmentLabel,
  levelLabel,
  loadHeight,
  periodTitle,
  periodWeeks,
  programFacts,
  roleLabel,
  sessionLengthLabel,
  sessionsPerWeekLabel,
  weekTitle,
  showsWeekNumber,
  weeksLabel,
  type ProgressionWeek,
  type TrainingProgramPeriod,
  type TrainingProgramSummary,
} from "./training";

const program = (over: Partial<TrainingProgramSummary> = {}): TrainingProgramSummary => ({
  id: "p1",
  title: "Grundstyrka",
  summary: "Tolv veckor mot ett tyngre marklyft.",
  weeks: 12,
  ...over,
});

const period = (over: Partial<TrainingProgramPeriod> = {}): TrainingProgramPeriod => ({
  name: "",
  role: "grund",
  start_week: 1,
  end_week: 4,
  ...over,
});

const week = (over: Partial<ProgressionWeek> = {}): ProgressionWeek => ({
  week_index: 0,
  relative_load: 1,
  role: null,
  is_deload: false,
  is_test: false,
  ...over,
});

describe("weeksLabel", () => {
  it("räknar veckorna, och böjer ordet efter antalet", () => {
    expect(weeksLabel(12)).toBe("12 veckor");
    expect(weeksLabel(1)).toBe("1 vecka");
  });
});

describe("sessionsPerWeekLabel", () => {
  it("skriver halvtalet i stället för att avrunda det", () => {
    // Sju pass på två veckor *är* 3,5. Avrundat till fyra hade varannan vecka
    // fått ett pass för mycket utlovat.
    expect(sessionsPerWeekLabel(3.5)).toBe("3,5 pass i veckan");
    expect(sessionsPerWeekLabel(3)).toBe("3 pass i veckan");
  });

  it("säger ingenting när talet saknas", () => {
    expect(sessionsPerWeekLabel(null)).toBeNull();
    expect(sessionsPerWeekLabel(undefined)).toBeNull();
    // Noll pass i veckan är inget program, och raden hade lovat ett svar.
    expect(sessionsPerWeekLabel(0)).toBeNull();
  });
});

describe("sessionLengthLabel", () => {
  it("kollapsar spannet till en punkt när passen är lika långa", () => {
    expect(sessionLengthLabel(3000, 3000)).toBe("ca 50 min");
    expect(sessionLengthLabel(3000, null)).toBe("ca 50 min");
    // Ett tak under golvet är inget spann. Servern ska inte skicka det, men om
    // den gör det ska ytan inte skriva "45–40".
    expect(sessionLengthLabel(2700, 2400)).toBe("ca 45 min");
  });

  it("skriver spannet när passen skiljer sig", () => {
    expect(sessionLengthLabel(2700, 3600)).toBe("ca 45–60 min");
  });

  it("säger ingenting utan golv", () => {
    expect(sessionLengthLabel(null, 3600)).toBeNull();
    expect(sessionLengthLabel(0, 3600)).toBeNull();
  });
});

describe("equipmentLabel", () => {
  it("skriver orden som innehållet bär dem", () => {
    // Ingen översättningstabell: `equipment` är fritext, och en tabell hade
    // tystnat första gången någon skrev ett ord den inte kände till.
    expect(equipmentLabel(["barbell", "bänk"])).toBe("barbell · bänk");
  });

  it("säger ingenting om en tom eller obefintlig lista", () => {
    expect(equipmentLabel([])).toBeNull();
    expect(equipmentLabel(undefined)).toBeNull();
    expect(equipmentLabel(["", "  "])).toBeNull();
  });
});

describe("levelLabel", () => {
  it("skriver nivån med versal", () => {
    expect(levelLabel("nybörjare")).toBe("Nybörjare");
    expect(levelLabel("avancerad")).toBe("Avancerad");
  });

  it("hittar inte på en nivå när coachen inte satt någon", () => {
    expect(levelLabel(null)).toBeNull();
    expect(levelLabel("")).toBeNull();
  });
});

describe("roleLabel och perioden", () => {
  it("namnger de fem rollerna", () => {
    expect(roleLabel("grund")).toBe("Grund");
    expect(roleLabel("uppbyggnad")).toBe("Uppbyggnad");
    expect(roleLabel("avlastning")).toBe("Avlastning");
    expect(roleLabel("topp")).toBe("Topp");
    expect(roleLabel("test")).toBe("Test");
  });

  it("lämnar en okänd roll orörd i stället för att tysta den", () => {
    // En roll servern lagt till och den här klienten inte känner igen är
    // fortfarande coachens ord. Att rita null hade tappat den.
    expect(roleLabel("tapering")).toBe("tapering");
    expect(roleLabel(null)).toBeNull();
  });

  it("låter coachens eget namn vinna över rollens", () => {
    expect(periodTitle(period({ name: "Bas" }))).toBe("Bas");
    expect(periodTitle(period({ name: "" }))).toBe("Grund");
    // Varken namn eller roll: ett veckospann och inget mer.
    expect(periodTitle(period({ name: "", role: null }))).toBeNull();
  });

  it("skriver veckospannet, och en punkt när perioden är en vecka", () => {
    expect(periodWeeks(period({ start_week: 1, end_week: 4 }))).toBe("vecka 1–4");
    expect(periodWeeks(period({ start_week: 3, end_week: 3 }))).toBe("vecka 3");
  });
});

describe("programFacts", () => {
  it("skriver fakta i den ordning frågan ställs, och utelämnar det som saknas", () => {
    expect(programFacts(program({
      weeks: 12,
      sessions_per_week: 4,
      session_seconds_min: 2700,
      session_seconds_max: 3600,
      level: "medel",
    }))).toEqual(["12 veckor", "4 pass i veckan", "ca 45–60 min", "Medel"]);
  });

  it("ritar inga streck för det programmet inte säger", () => {
    // En ruta som säger "–" har lovat ett svar och inte gett något.
    expect(programFacts(program())).toEqual(["12 veckor"]);
  });
});

describe("loadHeight", () => {
  it("ger den tyngsta veckan hela höjden", () => {
    expect(loadHeight(week({ relative_load: 1 }))).toBe(100);
  });

  it("lämnar ett golv, så att en lätt vecka är en stapel och inte ett hål", () => {
    expect(loadHeight(week({ relative_load: 0 }))).toBe(5);
    expect(loadHeight(week({ relative_load: 0.5 }))).toBe(53);
  });

  it("klipper tal utanför skalan i stället för att rita utanför bågen", () => {
    expect(loadHeight(week({ relative_load: 1.4 }))).toBe(100);
    expect(loadHeight(week({ relative_load: -0.2 }))).toBe(5);
  });
});

describe("weekTitle", () => {
  it("numrerar veckan ettbaserat, som ytan skriver den", () => {
    // Kontraktets week_index är nollbaserat; vecka 1 är den första.
    expect(weekTitle(week({ week_index: 0 }))).toBe("Vecka 1");
    expect(weekTitle(week({ week_index: 11 }))).toBe("Vecka 12");
  });

  it("sätter rollen före allt annat, eftersom den förklarar höjden", () => {
    expect(weekTitle(week({ week_index: 3, role: "avlastning", is_deload: true })))
      .toBe("Vecka 4 · Avlastning");
  });

  it("faller tillbaka på avlastningsflaggan när perioden saknar roll", () => {
    expect(weekTitle(week({ week_index: 3, role: null, is_deload: true })))
      .toBe("Vecka 4 · Avlastning");
  });

  it("märker testveckan", () => {
    expect(weekTitle(week({ week_index: 11, role: "test", is_test: true })))
      .toBe("Vecka 12 · Test");
  });
});

describe("weekTitle, testveckan utan testperiod", () => {
  /**
   * En vecka kan vara ett test utan att perioden heter så — sista veckan i en
   * toppperiod, till exempel. Då är flaggan det enda som säger det, och ordet
   * ska läggas till. Står det redan i rollen ska det inte sägas två gånger.
   */
  it("lägger till ordet när rollen inte redan bär det", () => {
    expect(weekTitle(week({ week_index: 11, role: "topp", is_test: true })))
      .toBe("Vecka 12 · Topp · Test");
  });
});

describe("showsWeekNumber", () => {
  it("numrerar ett kort program helt", () => {
    // Fyra staplar med bara »1« och »3« under ser ut som ett urval någon gjort.
    expect([0, 1, 2, 3].map((i) => showsWeekNumber(i, 4))).toEqual([true, true, true, true]);
    expect([0, 1, 2, 3, 4, 5].every((i) => showsWeekNumber(i, 6))).toBe(true);
  });

  it("glesar ut när programmet är långt", () => {
    expect([0, 1, 2, 3].map((i) => showsWeekNumber(i, 12))).toEqual([true, false, true, false]);
  });
});
