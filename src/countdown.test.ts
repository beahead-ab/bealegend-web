import { describe, expect, it } from "vitest";
import { countdownBand, countdownChoices, reachedLine } from "./countdown";
import type { CountdownStatus } from "./dashboard";

const status = (over: Partial<CountdownStatus> = {}): CountdownStatus => ({
  binding: "health.weight",
  title: "Vikten",
  deadline: "2026-10-01",
  days_left: 33,
  target: 80,
  direction: "down",
  latest_value: 86,
  latest_value_date: "2026-08-29",
  remaining: 6,
  pace_per_week: -0.4,
  pace_required_per_week: -1.3,
  projected_arrival: "2026-10-15",
  projected_arrival_early: "2026-09-24",
  projected_arrival_late: "2026-11-05",
  status: "behind",
  ...over,
});

const TODAY = "2026-08-29";

describe("countdownBand", () => {
  it("lägger bandet och datumet på samma tidslinje", () => {
    // Idag 29 aug, mål 1 okt, band 24 sep–5 nov. Spåret går till 5 nov,
    // eftersom bandet pekar förbi datumet.
    const band = countdownBand(status(), TODAY)!;
    // 24 sep är 26 dagar bort, 5 nov är 68 → spåret är 68 dagar.
    expect(Math.round(band.start)).toBe(38);
    expect(Math.round(band.start + band.width)).toBe(100);
    // 1 okt är 33 dagar bort av 68.
    expect(Math.round(band.deadline)).toBe(49);
  });

  it("säger ut när hela bandet ligger efter datumet", () => {
    // Hela prognosen efter måldatumet är den varning figuren finns till för.
    expect(countdownBand(status({
      projected_arrival_early: "2026-10-08", projected_arrival_late: "2026-10-20",
    }), TODAY)!.late).toBe(true);
    expect(countdownBand(status(), TODAY)!.late).toBe(false);
  });

  it("låter spåret sluta vid datumet när bandet ryms innanför", () => {
    const band = countdownBand(status({
      projected_arrival_early: "2026-09-10", projected_arrival_late: "2026-09-20",
    }), TODAY)!;
    // Spåret är 33 dagar (till 1 okt), och datumet står längst ut.
    expect(Math.round(band.deadline)).toBe(100);
    expect(Math.round(band.start)).toBe(36);
  });

  it("ritar ett band utan bredd som en linje och inte som ingenting", () => {
    // Två fönster som är eniga är ett skarpt svar, inte ett saknat.
    const band = countdownBand(status({
      projected_arrival_early: "2026-09-20", projected_arrival_late: "2026-09-20",
    }), TODAY)!;
    expect(band.width).toBe(0);
    expect(band.start).toBeGreaterThan(0);
  });

  it("ger inget band när det inte finns någon prognos", () => {
    // Tre ärliga fall: datumet passerat, takten åt fel håll, ingen mätning.
    expect(countdownBand(status({ status: "passed" }), TODAY)).toBeNull();
    expect(countdownBand(status({ projected_arrival_early: null, projected_arrival_late: null }), TODAY)).toBeNull();
    expect(countdownBand(status({ projected_arrival_late: null }), TODAY)).toBeNull();
  });

  it("ger inget band när måldatumet är idag eller bakåt", () => {
    // Ett spår utan längd går inte att lägga något på.
    expect(countdownBand(status({
      deadline: TODAY, projected_arrival_early: TODAY, projected_arrival_late: TODAY,
    }), TODAY)).toBeNull();
  });

  it("klipper ett band som börjat före idag i stället för att rita utanför", () => {
    const band = countdownBand(status({
      projected_arrival_early: "2026-08-01", projected_arrival_late: "2026-09-20",
    }), TODAY)!;
    expect(band.start).toBe(0);
  });

  it("läser datumen ur strängen och inte ur en UTC-tolkning", () => {
    // new Date("2026-08-24") är midnatt UTC — dagen innan väster om Greenwich,
    // och ett band en dag fel är ett band på fel sida om måldatumet.
    const band = countdownBand(status({
      deadline: "2026-08-31", projected_arrival_early: "2026-08-30", projected_arrival_late: "2026-08-30",
    }), TODAY)!;
    // 30 aug är dag 1 av 2.
    expect(Math.round(band.start)).toBe(50);
    expect(Math.round(band.deadline)).toBe(100);
  });
});

describe("countdownChoices", () => {
  it("erbjuder tre vägar vidare, som meningar och inte som handlingar", () => {
    const choices = countdownChoices(status());
    expect(choices.map((c) => c.label)).toEqual(["Flytta datumet", "Höj takten", "Sänk målet"]);
    // Meningen bär målets namn, så den går att läsa utan att veta var man tryckte.
    for (const choice of choices) expect(choice.sentence).toContain("vikten");
  });

  it("skriver meningar en människa kan skicka som de står", () => {
    // Ingen av dem utför något. Samtalet är editorn (DB-01), och en knapp som
    // tyst skrev om ett mål hade ändrat något användaren inte hunnit se.
    for (const choice of countdownChoices(status())) {
      expect(choice.sentence.length).toBeGreaterThan(20);
      expect(choice.sentence.endsWith(".") || choice.sentence.endsWith("?")).toBe(true);
    }
  });
});

describe("reachedLine", () => {
  it("skriver vad som nåddes, med enhet", () => {
    expect(reachedLine(status({ latest_value: 86.4 }), "kg")).toBe("86,4 kg");
    expect(reachedLine(status({ latest_value: 86 }))).toBe("86");
  });

  it("säger ingenting när servern inte vet", () => {
    expect(reachedLine(status({ latest_value: null }), "kg")).toBeNull();
  });
});

describe("dagen bandet räknas från", () => {
  /**
   * Servern har redan sagt vilken dag det är, via days_left. Att läsa
   * webbläsarens klocka hade lagt bandet på en annan tidslinje än den
   * days_left räknades på.
   */
  it("härleds ur måldatumet minus dagarna kvar", () => {
    // 1 okt minus 33 dagar = 29 aug, samma dag som proven ovan skickar in.
    const derived = countdownBand(status());
    const given = countdownBand(status(), "2026-08-29");
    expect(derived).toEqual(given);
  });

  it("följer serverns dag även när klienten tror något annat", () => {
    // Samma status, men servern säger att det är tio dagar kvar. Bandet ska
    // flytta med serverns tal, inte med datorns klocka.
    const near = countdownBand(status({ days_left: 10 }))!;
    const far = countdownBand(status({ days_left: 33 }))!;
    expect(near.deadline).not.toBe(far.deadline);
  });
});

describe("vad valen säger att de rör", () => {
  /**
   * Serverns titel på en nedräkning är generisk — »Nedräkning«. En mening som
   * säger »flytta datumet för nedräkning« säger inte vilket mål man rör, och
   * en användare med två nedräkningar hade inte kunnat se skillnad.
   */
  it("använder ordet målet mäter när ytan vet det", () => {
    const [first] = countdownChoices(status(), "Vikten");
    expect(first.sentence).toContain("för vikten");
  });

  it("faller tillbaka på nedräkningens egen titel", () => {
    const [first] = countdownChoices(status({ title: "Maraton" }));
    expect(first.sentence).toContain("för maraton");
  });
});
