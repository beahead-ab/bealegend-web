import { describe, expect, it } from "vitest";
import {
  blocks,
  canRun,
  estimateLabel,
  momentPrescription,
  restLabel,
  rpeLine,
  rpeWords,
  setLine,
  sharedRest,
  type PrescribedSet,
  type TrainingMoment,
  type TrainingSession,
} from "./training";

const moment = (over: Partial<TrainingMoment> = {}): TrainingMoment => ({
  id: "m1",
  phase: "main",
  position: 1,
  block_item_position: 1,
  name: "Knäböj",
  description: "",
  sets: 3,
  repetitions: 8,
  duration_seconds: null,
  distance_meters: null,
  rest_seconds: 90,
  notes: "",
  prescribed_sets: [],
  ...over,
});

const session = (moments: TrainingMoment[], mode = "sequential_sets"): TrainingSession => ({
  id: "s1",
  title: "Underkropp A",
  summary: "",
  session_type: "strength",
  execution_mode: mode,
  is_extra: false,
  estimated_seconds: 3300,
  moments,
});

const set = (over: Partial<PrescribedSet> = {}): PrescribedSet => ({
  index: 1,
  repetitions: 8,
  duration_seconds: null,
  distance_meters: null,
  rest_seconds: 90,
  target_rpe: null,
  target_rir: null,
  suggested_weight_kg: null,
  notes: "",
  ...over,
});

describe("blocks", () => {
  it("gathers the moments of one block together", () => {
    const result = blocks(session([
      moment({ id: "a", block_item_position: 1 }),
      moment({ id: "b", block_item_position: 1 }),
      moment({ id: "c", block_item_position: 2 }),
    ]));

    expect(result).toHaveLength(2);
    expect(result[0].moments.map((m) => m.id)).toEqual(["a", "b"]);
  });

  /**
   * The server orders the moments and applies the user's own per-occasion
   * adjustments while doing it. Sorting here would quietly undo them, which is
   * the same mistake sections() exists not to make.
   */
  it("keeps the order it was given rather than tidying it", () => {
    const result = blocks(session([
      moment({ id: "a", block_item_position: 2 }),
      moment({ id: "b", block_item_position: 1 }),
    ]));

    expect(result.map((block) => block.position)).toEqual([2, 1]);
  });

  it("splits a block that comes back twice rather than merging it", () => {
    const result = blocks(session([
      moment({ id: "a", block_item_position: 1 }),
      moment({ id: "b", block_item_position: 2 }),
      moment({ id: "c", block_item_position: 1 }),
    ]));

    expect(result.map((block) => block.position)).toEqual([1, 2, 1]);
  });
});

describe("canRun", () => {
  /** The web has no GPS for a whole run, no timer that survives a locked
   *  screen, and no watch. Drawing those as runnable would promise a pass it
   *  cannot finish. */
  it("runs only the mode the browser can honour", () => {
    expect(canRun(session([], "sequential_sets"))).toBe(true);
    expect(canRun(session([], "continuous_tracking"))).toBe(false);
    expect(canRun(session([], "intervals"))).toBe(false);
    expect(canRun(session([], "card_deck"))).toBe(false);
  });

  it("declines a mode it has never heard of", () => {
    expect(canRun(session([], "something_new"))).toBe(false);
  });
});

describe("momentPrescription", () => {
  it("counts reps when the moment prescribes them", () => {
    expect(momentPrescription(moment())).toBe("3 × 8 reps");
  });

  it("counts time when the moment is held rather than repeated", () => {
    expect(momentPrescription(moment({ repetitions: null, duration_seconds: 45 }))).toBe("3 × 45 s");
  });

  it("counts distance in kilometres once there are a thousand metres", () => {
    expect(momentPrescription(moment({ sets: 6, repetitions: null, distance_meters: 400 })))
      .toBe("6 × 400 m");
    expect(momentPrescription(moment({ sets: 1, repetitions: null, distance_meters: 5000 })))
      .toBe("1 × 5 km");
  });

  /** Better a bare set count than a measure the prescription never carried. */
  it("says only what it knows when there is no measure at all", () => {
    expect(momentPrescription(moment({ repetitions: null }))).toBe("3 set");
  });
});

describe("setLine", () => {
  it("puts the suggested weight next to the reps rather than leaving it to be looked up", () => {
    expect(setLine(set({ suggested_weight_kg: 82.5, target_rpe: 8 })))
      .toBe("8 reps · 82,5 kg · RPE 8 · 1 min 30 s vila");
  });

  it("falls back to reps in reserve when there is no RPE", () => {
    expect(setLine(set({ target_rir: 2, rest_seconds: 0 }))).toBe("8 reps · 2 RIR");
  });

  it("leaves out a rest that is not prescribed", () => {
    expect(setLine(set({ rest_seconds: 0 }))).toBe("8 reps");
  });
});

describe("sharedRest", () => {
  it("lifts out a rest every set agrees on", () => {
    expect(sharedRest([set(), set({ index: 2 }), set({ index: 3 })])?.rest_seconds).toBe(90);
  });

  /** Samma golv men olika tak är inte samma vila. Att lyfta ut den hade dolt
   *  just skillnaden — vilket är precis vad utlyftningen finns för att undvika. */
  it("lyfter inte ut en vila där bara golvet stämmer", () => {
    expect(sharedRest([
      set({ rest_seconds_max: 120 }),
      set({ index: 2, rest_seconds_max: 180 }),
    ])).toBeNull();
  });

  /** Then it belongs on each line after all — one differing set is exactly the
   *  thing a lifted-out label would hide. */
  it("leaves the rest on the lines when the sets disagree", () => {
    expect(sharedRest([set(), set({ index: 2, rest_seconds: 180 })])).toBeNull();
  });

  it("has nothing to lift out of a moment with no prescription", () => {
    expect(sharedRest([])).toBeNull();
    expect(sharedRest([set({ rest_seconds: 0 })])).toBeNull();
  });

  it("drops the rest from the line when it is said once instead", () => {
    expect(setLine(set({ suggested_weight_kg: 80 }), false)).toBe("8 reps · 80 kg");
  });
});

describe("ordinationsspann", () => {
  it("skriver RPE som ett spann när taket finns", () => {
    expect(setLine(set({ target_rpe: 7, target_rpe_max: 8, rest_seconds: 0 })))
      .toBe("8 reps · RPE 7–8");
  });

  it("skriver vilan som ett spann i sekunder", () => {
    expect(setLine(set({ rest_seconds: 90, rest_seconds_max: 120 })))
      .toBe("8 reps · 90–120 s vila");
  });

  it("skriver andelen av 1RM, som spann och som punkt", () => {
    expect(setLine(set({ percent_1rm: 75, percent_1rm_max: 80, rest_seconds: 0 })))
      .toBe("8 reps · 75–80 % av 1RM");
    expect(setLine(set({ percent_1rm: 75, rest_seconds: 0 })))
      .toBe("8 reps · 75 % av 1RM");
  });

  it("skriver RIR som spann när RPE saknas", () => {
    expect(setLine(set({ target_rir: 1, target_rir_max: 3, rest_seconds: 0 })))
      .toBe("8 reps · 1–3 RIR");
  });

  /** Ett tak som inte säger något nytt är en punkt. »RPE 8–8« hade fått en
   *  ordination att se osäker ut utan att vara det. */
  it("ritar inget spann när taket är lika med golvet", () => {
    expect(setLine(set({ target_rpe: 8, target_rpe_max: 8, rest_seconds: 0 })))
      .toBe("8 reps · RPE 8");
  });

  /** Mitt i ett set behöver man ett tal att gå på, inte ett fönster att välja
   *  i. Golvet är det ordinationen alltid garanterar. */
  it("kollapsar till golvet på setet som körs", () => {
    const s = set({ target_rpe: 7, target_rpe_max: 8, percent_1rm: 75, percent_1rm_max: 80,
      rest_seconds: 90, rest_seconds_max: 120 });
    expect(setLine(s, true, true)).toBe("8 reps · 75 % av 1RM · RPE 7 · 1 min 30 s vila");
  });

  it("en ordination utan spann ser ut precis som förut", () => {
    expect(setLine(set({ suggested_weight_kg: 82.5, target_rpe: 8 })))
      .toBe("8 reps · 82,5 kg · RPE 8 · 1 min 30 s vila");
  });
});

describe("restLabel and estimateLabel", () => {
  it("switches to minutes once seconds stop being readable", () => {
    expect(restLabel(45)).toBe("45 s vila");
    expect(restLabel(120)).toBe("2 min vila");
  });

  /** The most common rest in strength training. Rounding it to whole minutes
   *  would prescribe a third more rest than the pass asks for. */
  it("says a minute and a half exactly rather than rounding it to two", () => {
    expect(restLabel(90)).toBe("1 min 30 s vila");
  });

  /** An estimate is allowed to round — seconds inside an "about" are false
   *  precision, which is the opposite problem. */
  it("rounds the estimate where it refuses to round the prescription", () => {
    expect(estimateLabel(3330)).toBe("ca 56 min");
  });

  it("says nothing rather than nothing-shaped", () => {
    expect(restLabel(0)).toBeNull();
    expect(estimateLabel(null)).toBeNull();
    expect(estimateLabel(0)).toBeNull();
  });

  it("estimates the pass in minutes", () => {
    expect(estimateLabel(3300)).toBe("ca 55 min");
  });
});

describe("rpeWords", () => {
  /** Siffran är ett lösenord för den som inte redan kan skalan. Meningen är
   *  vad siffran betyder — båda visas, och ingen behöver kunna skalan utantill. */
  it("säger vad talet betyder i rep", () => {
    expect(rpeWords(10)).toBe("inget mer rep fanns");
    expect(rpeWords(9)).toBe("ett rep kvar");
    expect(rpeWords(8)).toBe("två rep kvar");
    expect(rpeWords(7)).toBe("tre rep kvar");
  });

  it("halvsteg får sin egen mening i stället för att avrundas bort", () => {
    expect(rpeWords(9.5)).toBe("kanske ett till");
    expect(rpeWords(8.5)).toBe("ett till två kvar");
  });

  it("under sex är det lätt, och det sägs så", () => {
    expect(rpeWords(4)).toBe("lätt, många rep kvar");
  });

  it("raden är talet och betydelsen, i den ordningen", () => {
    expect(rpeLine(8)).toBe("RPE 8 · två rep kvar");
  });
});
