import { describe, expect, it } from "vitest";
import { dividerLabel, splitProse, threadDays, type ThreadMessage, opensGap } from "./thread";

const at = (iso: string): ThreadMessage => ({
  id: iso,
  role: "user",
  text: "hej",
  actions: [],
  streaming: false,
  failed: false,
  createdAt: new Date(iso),
});

const now = new Date("2026-08-21T18:40:00");

/** Ported from the iOS client's ThreadCalendarTests. */
describe("threadDays", () => {
  it("gives messages on one day a single divider", () => {
    const days = threadDays([at("2026-08-21T09:00:00"), at("2026-08-21T18:00:00")], now);

    expect(days).toHaveLength(1);
    expect(days[0].messages).toHaveLength(2);
  });

  it("gives each calendar day its own divider", () => {
    const days = threadDays([at("2026-08-19T09:00:00"), at("2026-08-21T09:00:00")], now);

    expect(days).toHaveLength(2);
  });

  it("splits the thread at midnight", () => {
    const days = threadDays([at("2026-08-20T23:59:00"), at("2026-08-21T00:01:00")], now);

    expect(days).toHaveLength(2);
  });

  it("names today and yesterday rather than dating them", () => {
    expect(dividerLabel(new Date("2026-08-21T18:40:00"), now)).toBe("Idag 18:40");
    expect(dividerLabel(new Date("2026-08-20T09:12:00"), now)).toContain("Igår");
  });

  it("spells an older day out", () => {
    const label = dividerLabel(new Date("2026-08-16T17:18:00"), now);

    expect(label).toContain("söndag");
    expect(label).toContain("17:18");
  });

  it("preserves order", () => {
    const days = threadDays([at("2026-08-19T09:00:00"), at("2026-08-20T09:00:00"), at("2026-08-21T09:00:00")], now);

    expect(days.map((day) => day.messages[0].createdAt.getDate())).toEqual([19, 20, 21]);
  });

  it("has no dividers for an empty thread", () => {
    expect(threadDays([], now)).toEqual([]);
  });
});

const payload = '```json\n{"type":"meal","description":"Grekisk yoghurt 0% med paj","calories":500,"protein":26}\n```';

/** Ported from the iOS client's ThreadProseTests. */
describe("splitProse", () => {
  it("never lets the payload reach the prose", () => {
    const prose = splitProse(`Grekisk yoghurt med en mindre bit paj blir ungefär 500 kcal.\n${payload}`);

    expect(prose.text).toBe("Grekisk yoghurt med en mindre bit paj blir ungefär 500 kcal.");
    expect(prose.text).not.toContain("{");
  });

  it("keeps the receipt as a chip", () => {
    const prose = splitProse(`Sparat.\n${payload}`);

    expect(prose.meal).toEqual({ description: "Grekisk yoghurt 0% med paj", calories: 500 });
  });

  /** The fence opens several deltas before it closes. */
  it("hides an unclosed fence while streaming", () => {
    const prose = splitProse('Sparat.\n```json\n{"type":"me');

    expect(prose.text).toBe("Sparat.");
    expect(prose.meal).toBeNull();
  });

  it("leaves an ordinary reply untouched", () => {
    const prose = splitProse("Du har 620 kcal kvar i dag.");

    expect(prose.text).toBe("Du har 620 kcal kvar i dag.");
    expect(prose.meal).toBeNull();
  });

  it("strips a block it cannot read, without a chip", () => {
    const prose = splitProse("Hm.\n```json\n{not json}\n```");

    expect(prose.text).toBe("Hm.");
    expect(prose.meal).toBeNull();
  });
});

describe("opensGap", () => {
  const at = (minutes: number): ThreadMessage => ({
    id: `m${minutes}`,
    role: "user",
    text: "",
    actions: [],
    streaming: false,
    failed: false,
    createdAt: new Date(2026, 7, 21, 12, minutes),
  });

  /**
   * Twenty minutes, not every role change. Roles alternate constantly in a real
   * exchange, so stamping each one would put a time on nearly every bubble and
   * turn the thread into a log — the thing the day dividers exist to avoid.
   */
  it("marks a pause long enough to need placing", () => {
    expect(opensGap(at(25), at(0))).toBe(true);
    expect(opensGap(at(20), at(0))).toBe(true);
  });

  it("leaves a continuous exchange unmarked", () => {
    expect(opensGap(at(3), at(0))).toBe(false);
    expect(opensGap(at(19), at(0))).toBe(false);
  });

  it("never marks the first message of a day", () => {
    expect(opensGap(at(0), undefined)).toBe(false);
  });
});
