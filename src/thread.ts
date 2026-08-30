export type ThreadRole = "user" | "assistant" | "system";

export type ThreadAction = { action_type: string; summary: string };

export type ThreadMessage = {
  id: string;
  role: ThreadRole;
  text: string;
  /** Bilden som hör till just den här turen, lokal eller återläst från servern. */
  attachmentUrl?: string | null;
  /** Måltiden bilden blev, när den har sparats. */
  attachmentMealId?: string | null;
  actions: ThreadAction[];
  streaming: boolean;
  failed: boolean;
  createdAt: Date;
};

const SWEDISH = "sv-SE";

function time(date: Date): string {
  return date.toLocaleTimeString(SWEDISH, { hour: "2-digit", minute: "2-digit" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/**
 * The time comes from the day's first message, so a divider says when the
 * conversation started rather than when it is being read.
 */
export function dividerLabel(date: Date, now = new Date()): string {
  if (sameDay(date, now)) return `Idag ${time(date)}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `Igår ${time(date)}`;

  const day = date.toLocaleDateString(SWEDISH, { weekday: "long", day: "numeric", month: "long" });
  return `${day} ${time(date)}`;
}

export type ThreadDay = { key: string; label: string; messages: ThreadMessage[] };

/** Groups an ascending list into calendar days, preserving order. */
export function threadDays(messages: ThreadMessage[], now = new Date()): ThreadDay[] {
  const days: ThreadDay[] = [];
  for (const message of messages) {
    const key = message.createdAt.toDateString();
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      days.push({ key, label: dividerLabel(message.createdAt, now), messages: [message] });
    }
  }
  return days;
}

/**
 * A gap long enough that "vad sa du innan lunch?" needs an answer. Twenty
 * minutes rather than every role change: roles alternate constantly in a real
 * exchange, so stamping each one would put a time on nearly every bubble and
 * turn the thread into a log — the one thing the divider design avoids.
 */
const GAP_MS = 20 * 60 * 1000;

export function timeLabel(date: Date): string {
  return time(date);
}

/** Whether this message opens a new stretch of talking within its day. */
export function opensGap(message: ThreadMessage, previous: ThreadMessage | undefined): boolean {
  if (!previous) return false;
  return message.createdAt.getTime() - previous.createdAt.getTime() >= GAP_MS;
}

export type MealReceipt = { description: string; calories: number };

export type Prose = { text: string; meal: MealReceipt | null };

const FENCED = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
const FENCE_OPENING = /```(?:json)?/i;

/**
 * The coach answers with prose and, when it recognises a meal, a machine
 * payload fenced in a code block. The meal screen parsed that out and drew a
 * card, so nobody ever saw it — a thread rendering what the server stored shows
 * it in full unless it does the same.
 *
 * Split rather than hidden: the payload is what the receipt chip is made of, so
 * discarding it would lose the acknowledgement along with the noise.
 */
export function splitProse(raw: string): Prose {
  const fenced = raw.match(FENCED);
  if (fenced) {
    return {
      text: raw.replace(FENCED, "").trim(),
      meal: mealFrom(fenced[1]),
    };
  }

  // Still streaming: the fence has opened but not closed. Hide from the opening
  // onwards, or the JSON flickers into view on every streamed meal reply.
  const opening = raw.match(FENCE_OPENING);
  if (opening?.index !== undefined) {
    return { text: raw.slice(0, opening.index).trim(), meal: null };
  }

  return { text: raw.trim(), meal: null };
}

function mealFrom(json: string): MealReceipt | null {
  try {
    const payload = JSON.parse(json) as { type?: string; description?: string; calories?: number };
    if (payload.type !== "meal" || !payload.description || typeof payload.calories !== "number") return null;
    return { description: payload.description, calories: Math.round(payload.calories) };
  } catch {
    // A block we cannot read is still not something to show a person.
    return null;
  }
}

export function receiptText(meal: MealReceipt): string {
  return `${meal.description} · ${meal.calories} kcal`;
}

/** Falls back to a neutral tick: the server may gain tools before this ships again. */
export function actionSymbol(actionType: string): string {
  switch (actionType) {
    case "log_meal":
    case "copy_meal":
      return "🍽";
    case "read_meals":
      return "📋";
    case "move_session":
      return "📅";
    case "skip_session":
      return "⤫";
    case "dashboard":
      return "▦";
    case "readiness":
      return "◍";
    default:
      return "✓";
  }
}
