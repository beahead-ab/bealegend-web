import {
  isFinished,
  measure,
  type TrainingRun,
  type TrainingRunSetResult,
  type TrainingSession,
} from "./training";

/**
 * Kvittot efter ett pass.
 *
 * Byggt ur körningens egen `set_results` och inte ur klientens minne av vad
 * den skickade. Skillnaden är hela poängen: ett pass som börjat i telefonen
 * och avslutats här bär sina tidigare set i serverns lista men inte i den här
 * fliken, och ett kvitto som bara visade det den här enheten råkade logga hade
 * påstått att resten inte hänt.
 *
 * Ingenting räknas om. Vikterna, repetitionerna och ansträngningen är de tal
 * som sparades i stunden — kvittot läser dem, det härleder dem inte.
 */
const number = (value: number) => value.toLocaleString("sv-SE");

export type ReceiptSet = {
  index: number;
  /** `completed` eller `skipped`, som servern skrev det. */
  status: string;
  /** Vad som loggades, som en rad. Tom sträng när setet hoppades över utan
   *  siffror — då säger märket allt som finns att säga. */
  line: string;
};

export type ReceiptMoment = {
  stepId: string;
  name: string;
  sets: ReceiptSet[];
};

export type Receipt = {
  /** Sant när passet avslutades i förtid — servern skrev `completed_partial`.
   *  Sparat och räknat, men inte kört till slut, och det är en annan sak än
   *  att ha kastat det. */
  partial: boolean;
  activeSeconds: number;
  setsCompleted: number;
  setsSkipped: number;
  /**
   * Lyfta kilon: vikt gånger repetitioner över de set som bär båda talen.
   *
   * Null när inget set vägdes. Ett löppass har inga kilon, och noll hade
   * påstått att någon lyft ingenting när hen sprungit fem kilometer.
   */
  volumeKg: number | null;
  /** Momenten som faktiskt har loggade set, i passets egen ordning. */
  moments: ReceiptMoment[];
};

/** Ett loggat set som en rad: »8 reps · 82,5 kg · RPE 8«. */
export function loggedLine(result: TrainingRunSetResult): string {
  const parts: string[] = [];
  const each = measure(result.repetitions, result.duration_seconds, result.distance_meters);
  if (each) parts.push(each);
  if (result.weight_kg != null) parts.push(`${number(result.weight_kg)} kg`);
  if (result.effort_rpe != null) parts.push(`RPE ${number(result.effort_rpe)}`);
  return parts.join(" · ");
}

/**
 * Kvittot för en avslutad körning, eller null när passet inte är avslutat.
 *
 * Ett pågående pass har inget kvitto — raden hade varit en delsumma som såg ut
 * som ett facit.
 */
export function receiptFrom(session: TrainingSession, run: TrainingRun): Receipt | null {
  if (!isFinished(run)) return null;
  const results = run.set_results ?? [];

  const byStep = new Map<string, TrainingRunSetResult[]>();
  for (const result of results) {
    const list = byStep.get(result.step_id);
    if (list) list.push(result);
    else byStep.set(result.step_id, [result]);
  }

  // Passets egen ordning, inte loggningens. Den som läser kvittot letar efter
  // momentet där det stod i passet.
  const moments: ReceiptMoment[] = [];
  for (const moment of session.moments) {
    const logged = byStep.get(moment.id);
    if (!logged || logged.length === 0) continue;
    moments.push({
      stepId: moment.id,
      name: moment.name,
      sets: [...logged]
        .sort((a, b) => a.set_index - b.set_index)
        .map((result) => ({
          index: result.set_index,
          status: result.status,
          line: result.status === "skipped" ? "" : loggedLine(result),
        })),
    });
  }

  let volume: number | null = null;
  for (const result of results) {
    if (result.status === "skipped") continue;
    if (result.weight_kg == null || result.repetitions == null) continue;
    volume = (volume ?? 0) + result.weight_kg * result.repetitions;
  }

  return {
    partial: run.status === "completed_partial",
    activeSeconds: run.active_seconds,
    setsCompleted: results.filter((result) => result.status !== "skipped").length,
    setsSkipped: results.filter((result) => result.status === "skipped").length,
    // Kilon avrundas till heltal. Ett decimaltal på ett tal i tusenklassen är
    // en precision summan inte har — den byggdes av vikter i halvkilosteg.
    volumeKg: volume === null ? null : Math.round(volume),
    moments,
  };
}

/** »12 set« eller »11 set, 1 överhoppat«. Aldrig noll överhoppade utskrivet. */
export function setsLine(receipt: Receipt): string | null {
  const done = receipt.setsCompleted;
  const skipped = receipt.setsSkipped;
  if (done === 0 && skipped === 0) return null;
  const doneText = `${number(done)} set`;
  if (skipped === 0) return doneText;
  return `${doneText}, ${number(skipped)} ${skipped === 1 ? "överhoppat" : "överhoppade"}`;
}

/** »1 240 kg lyft«, eller null när inget vägdes. */
export function volumeLine(receipt: Receipt): string | null {
  return receipt.volumeKg === null ? null : `${number(receipt.volumeKg)} kg lyft`;
}

/**
 * Rubriken. Ett pass avslutat i förtid sägs ut som just det — sparat och
 * räknat, men inte kört till slut. Att kalla båda »Klart« hade gjort ordet
 * betydelselöst för den som verkligen körde hela passet.
 */
export function receiptHeading(receipt: Receipt): string {
  return receipt.partial ? "Avslutat i förtid" : "Passet är klart";
}

/**
 * Det som servern har sparat för ett visst set, eller null.
 *
 * Låter passvyn märka set som loggats någon annanstans — ett pass som börjat i
 * telefonen och fortsätter här visade tidigare sina första set omärkta, som om
 * de inte hänt. Klientens eget minne står kvar som förstahandskälla eftersom
 * det är omedelbart; det här fyller i resten.
 */
export function resultFor(
  run: TrainingRun | null,
  stepId: string,
  setIndex: number,
): TrainingRunSetResult | null {
  return (run?.set_results ?? []).find(
    (result) => result.step_id === stepId && result.set_index === setIndex,
  ) ?? null;
}
