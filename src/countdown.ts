import type { CountdownStatus } from "./dashboard";

/**
 * Nedräkningens band, som en figur att rita.
 *
 * Talen kommer från servern: `projected_arrival_early` och `_late` är de två
 * pacefönstrens svar, och avståndet mellan dem *är* prognosens ärliga bredd.
 * Det här räknar om tre datum till andelar av en tidslinje — ingenting annat.
 *
 * **Bandet smalnar av sig självt.** När dagarna går och de två fönstren
 * närmar sig varandra krymper avståndet, och figuren följer med. Att rita en
 * kil som avsmalnar oavsett vad talen säger hade varit dekor som utger sig för
 * att vara information: bandet hade sett säkrare ut mot slutet även när
 * mätningarna spretade mer än någonsin.
 */
export type CountdownBand = {
  /** Bandets vänsterkant, i procent av spåret. */
  start: number;
  /** Bandets bredd i procent. Noll bredd ritas som en linje, inte som inget. */
  width: number;
  /** Var måldatumet står, i procent. */
  deadline: number;
  /** Sant när hela bandet ligger efter måldatumet — framme för sent. */
  late: boolean;
};

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Byggt av delarna: new Date("2026-08-24") är midnatt UTC, alltså dagen
  // innan för alla väster om den.
  return Math.floor(new Date(year, month - 1, day).getTime() / 86_400_000);
}

/**
 * Bandet, eller null när det inte finns någon prognos att rita.
 *
 * Null i tre fall, och alla tre är ärliga: måldatumet har passerat (då finns
 * ett resultat, inte en prognos), takten går åt fel håll så servern lämnar
 * ingen ankomst, eller så finns ingen mätning att räkna ur.
 */
export function countdownBand(status: CountdownStatus, today?: string): CountdownBand | null {
  const early = status.projected_arrival_early;
  const late = status.projected_arrival_late;
  if (status.status === "passed" || !early || !late) return null;

  // Dagen härleds ur servern: måldatumet minus dagarna kvar. Att läsa
  // webbläsarens klocka hade lagt bandet på en annan tidslinje än den
  // servern räknade `days_left` på, och figuren hade glidit en dag i sidled
  // för den som har fel tid i datorn eller sitter i en annan tidszon.
  const now = today != null ? dayNumber(today) : dayNumber(status.deadline) - status.days_left;
  const deadline = dayNumber(status.deadline);
  const from = dayNumber(early);
  const to = dayNumber(late);

  // Spåret sträcker sig från idag till det som ligger sist av måldatumet och
  // bandets slut. Ett band som pekar förbi datumet ska synas göra det — att
  // klippa spåret vid måldatumet hade dolt just den varningen.
  const end = Math.max(deadline, to);
  const span = end - now;
  if (span <= 0) return null;

  const percent = (day: number) => ((day - now) / span) * 100;
  const start = Math.max(0, Math.min(100, percent(from)));
  const stop = Math.max(0, Math.min(100, percent(to)));

  return {
    start,
    width: Math.max(0, stop - start),
    deadline: Math.max(0, Math.min(100, percent(deadline))),
    late: from > deadline,
  };
}

/**
 * Vad kvittot efter datumet erbjuder.
 *
 * Tre vägar vidare, och ingen av dem utförs här. Varje val lägger en mening i
 * samtalet, som användaren läser och skickar själv — samtalet är editorn
 * (`DB-01`), och en knapp som tyst skrev om ett mål hade ändrat något
 * användaren inte hunnit se.
 */
export type CountdownChoice = { label: string; sentence: string };

export function countdownChoices(status: CountdownStatus, subject?: string): CountdownChoice[] {
  // Det ordet målet *mäter* när ytan vet det, annars nedräkningens egen titel.
  // Serverns titel är generisk — »Nedräkning« — och »flytta datumet för
  // nedräkning« säger inte vilket mål man rör.
  const title = (subject ?? status.title).toLowerCase();
  return [
    {
      label: "Flytta datumet",
      sentence: `Jag vill flytta datumet för ${title}. Vilket datum är rimligt utifrån min takt?`,
    },
    {
      label: "Höj takten",
      sentence: `Jag vill hålla datumet för ${title}. Vad krävs av mig per vecka för att hinna?`,
    },
    {
      label: "Sänk målet",
      sentence: `Jag vill sänka målet för ${title} till något jag når på den tid jag har.`,
    },
  ];
}

/**
 * Vad som faktiskt blev, som en mening. Null när servern inte vet — då säger
 * kvittot bara att datumet passerat, vilket är allt som är sant.
 */
export function reachedLine(status: CountdownStatus, unit?: string): string | null {
  if (status.latest_value == null) return null;
  const value = status.latest_value.toLocaleString("sv-SE");
  return unit ? `${value} ${unit}` : value;
}
