import { describe, expect, it } from "vitest";
import {
  loggedLine,
  receiptFrom,
  receiptHeading,
  setsLine,
  volumeLine,
  type Receipt,
} from "./receipt";
import type { TrainingMoment, TrainingRun, TrainingRunSetResult, TrainingSession } from "./training";

const moment = (id: string, name: string): TrainingMoment => ({
  id, phase: "main", position: 1, block_item_position: 1, name,
  description: "", sets: 3, repetitions: 8, duration_seconds: null,
  distance_meters: null, rest_seconds: 90, notes: "", prescribed_sets: [],
});

const session = (...moments: TrainingMoment[]): TrainingSession => ({
  id: "s1", title: "Tungt underkropp", summary: "", session_type: "gym",
  execution_mode: "sequential_sets", is_extra: false, estimated_seconds: 3600,
  moments,
});

const result = (over: Partial<TrainingRunSetResult> = {}): TrainingRunSetResult => ({
  step_id: "m1", set_index: 1, status: "completed",
  repetitions: 8, weight_kg: 80, duration_seconds: null,
  distance_meters: null, effort_rpe: null, completed_at: "2026-08-29T10:00:00Z",
  ...over,
});

const run = (over: Partial<TrainingRun> = {}): TrainingRun => ({
  id: "r1", session_id: "s1", status: "completed",
  started_at: "2026-08-29T09:00:00Z", completed_at: "2026-08-29T10:00:00Z",
  active_seconds: 2892, current_step_id: null, current_set_index: 1,
  state_version: 9, allowed_actions: [], paused_at: null,
  accumulated_pause_seconds: 0, set_results: [],
  ...over,
});

describe("receiptFrom", () => {
  it("ger inget kvitto för ett pass som pågår", () => {
    // En delsumma mitt i passet hade sett ut som ett facit.
    expect(receiptFrom(session(moment("m1", "Knäböj")), run({ status: "active" }))).toBeNull();
    expect(receiptFrom(session(moment("m1", "Knäböj")), run({ status: "paused" }))).toBeNull();
  });

  it("ger ett kvitto för varje avslutat läge", () => {
    for (const status of ["completed", "completed_partial", "cancelled", "discarded"]) {
      expect(receiptFrom(session(moment("m1", "Knäböj")), run({ status }))).not.toBeNull();
    }
  });

  it("läser serverns lista, inte klientens minne", () => {
    // Ett pass som börjat i telefonen bär sina tidigare set i serverns svar.
    // Ett kvitto ur den här flikens minne hade påstått att de inte hänt.
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj")),
      run({ set_results: [result({ set_index: 1 }), result({ set_index: 2 })] }),
    )!;
    expect(receipt.setsCompleted).toBe(2);
    expect(receipt.moments[0].sets.map((s) => s.index)).toEqual([1, 2]);
  });

  it("följer passets ordning och inte loggningens", () => {
    // Den som läser kvittot letar efter momentet där det stod i passet.
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj"), moment("m2", "Marklyft")),
      run({ set_results: [result({ step_id: "m2" }), result({ step_id: "m1" })] }),
    )!;
    expect(receipt.moments.map((m) => m.name)).toEqual(["Knäböj", "Marklyft"]);
  });

  it("sorterar seten inom momentet på sitt nummer", () => {
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj")),
      run({ set_results: [result({ set_index: 3 }), result({ set_index: 1 }), result({ set_index: 2 })] }),
    )!;
    expect(receipt.moments[0].sets.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("utelämnar moment ingen loggade något för", () => {
    // Ett moment utan set är inte "0 set" — det är inget att kvittera.
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj"), moment("m2", "Marklyft")),
      run({ set_results: [result({ step_id: "m1" })] }),
    )!;
    expect(receipt.moments).toHaveLength(1);
  });

  it("räknar överhoppade set för sig", () => {
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj")),
      run({ set_results: [result({ set_index: 1 }), result({ set_index: 2, status: "skipped" })] }),
    )!;
    expect(receipt.setsCompleted).toBe(1);
    expect(receipt.setsSkipped).toBe(1);
    // Ett överhoppat set står kvar i listan, märkt. Att dölja det hade gjort
    // kvittot till en tillrättalagd version av passet.
    expect(receipt.moments[0].sets[1]).toEqual({ index: 2, status: "skipped", line: "" });
  });

  it("skiljer avslutat i förtid från avslutat", () => {
    expect(receiptFrom(session(moment("m1", "K")), run({ status: "completed" }))!.partial).toBe(false);
    expect(receiptFrom(session(moment("m1", "K")), run({ status: "completed_partial" }))!.partial).toBe(true);
  });
});

describe("volymen", () => {
  it("summerar vikt gånger repetitioner", () => {
    const receipt = receiptFrom(
      session(moment("m1", "Knäböj")),
      run({ set_results: [
        result({ set_index: 1, weight_kg: 80, repetitions: 8 }),
        result({ set_index: 2, weight_kg: 82.5, repetitions: 6 }),
      ] }),
    )!;
    // 640 + 495 = 1135
    expect(receipt.volumeKg).toBe(1135);
  });

  it("avrundar till heltal", () => {
    // 82,5 × 5 = 412,5. En decimal på en summa byggd av halvkilosteg är en
    // precision talet inte har.
    const receipt = receiptFrom(
      session(moment("m1", "K")),
      run({ set_results: [result({ weight_kg: 82.5, repetitions: 5 })] }),
    )!;
    expect(receipt.volumeKg).toBe(413);
  });

  it("räknar inte överhoppade set", () => {
    const receipt = receiptFrom(
      session(moment("m1", "K")),
      run({ set_results: [
        result({ set_index: 1, weight_kg: 80, repetitions: 8 }),
        result({ set_index: 2, weight_kg: 80, repetitions: 8, status: "skipped" }),
      ] }),
    )!;
    expect(receipt.volumeKg).toBe(640);
  });

  it("är null när inget vägdes, inte noll", () => {
    // Ett löppass har inga kilon. Noll hade påstått att någon lyft ingenting
    // när hen sprungit fem kilometer.
    const receipt = receiptFrom(
      session(moment("m1", "Löpning")),
      run({ set_results: [result({ weight_kg: null, repetitions: null, duration_seconds: 1800 })] }),
    )!;
    expect(receipt.volumeKg).toBeNull();
    expect(volumeLine(receipt)).toBeNull();
  });

  it("hoppar över set som saknar det ena talet", () => {
    // Vikt utan repetitioner ger ingen volym, och repetitioner utan vikt
    // heller. Att gissa det saknade talet hade hittat på en summa.
    const receipt = receiptFrom(
      session(moment("m1", "K")),
      run({ set_results: [
        result({ set_index: 1, weight_kg: 80, repetitions: null }),
        result({ set_index: 2, weight_kg: null, repetitions: 8 }),
        result({ set_index: 3, weight_kg: 60, repetitions: 10 }),
      ] }),
    )!;
    expect(receipt.volumeKg).toBe(600);
  });
});

describe("loggedLine", () => {
  it("skriver måttet, vikten och ansträngningen i den ordningen", () => {
    expect(loggedLine(result({ repetitions: 8, weight_kg: 82.5, effort_rpe: 8 })))
      .toBe("8 reps · 82,5 kg · RPE 8");
  });

  it("utelämnar det som inte loggades", () => {
    expect(loggedLine(result({ repetitions: 8, weight_kg: null, effort_rpe: null }))).toBe("8 reps");
  });

  it("skriver tid och distans med samma ord som ordinationen", () => {
    // Det som stod som "45 s" före passet ska läsas som "45 s" efteråt.
    expect(loggedLine(result({ repetitions: null, weight_kg: null, duration_seconds: 45 }))).toBe("45 s");
    expect(loggedLine(result({ repetitions: null, weight_kg: null, distance_meters: 400 }))).toBe("400 m");
  });
});

describe("setsLine", () => {
  const receipt = (done: number, skipped: number): Receipt => ({
    partial: false, activeSeconds: 0, setsCompleted: done, setsSkipped: skipped,
    volumeKg: null, moments: [],
  });

  it("skriver bara antalet när inget hoppades över", () => {
    // "12 set, 0 överhoppade" ber ögat läsa en nolla som inte betyder något.
    expect(setsLine(receipt(12, 0))).toBe("12 set");
  });

  it("böjer ordet efter antalet", () => {
    expect(setsLine(receipt(11, 1))).toBe("11 set, 1 överhoppat");
    expect(setsLine(receipt(9, 3))).toBe("9 set, 3 överhoppade");
  });

  it("säger ingenting om ett pass utan loggade set", () => {
    expect(setsLine(receipt(0, 0))).toBeNull();
  });
});

describe("receiptHeading", () => {
  it("säger ut att passet avslutades i förtid", () => {
    // Att kalla båda "Klart" hade gjort ordet betydelselöst för den som
    // verkligen körde hela passet.
    const base = { activeSeconds: 0, setsCompleted: 0, setsSkipped: 0, volumeKg: null, moments: [] };
    expect(receiptHeading({ ...base, partial: false })).toBe("Passet är klart");
    expect(receiptHeading({ ...base, partial: true })).toBe("Avslutat i förtid");
  });
});
