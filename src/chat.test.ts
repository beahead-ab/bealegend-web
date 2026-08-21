import { describe, expect, it } from "vitest";
import { sseEvents, type ChatStreamEvent } from "./chat";

/** Feeds the parser the way a socket would: in arbitrary pieces. */
function drain(chunks: string[]): ChatStreamEvent[] {
  const buffer = { rest: "" };
  return chunks.flatMap((chunk) => sseEvents(buffer, chunk));
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

describe("sseEvents", () => {
  it("reads prose deltas in order", () => {
    expect(drain([delta("Du har "), delta("620 kcal kvar.")])).toEqual([
      { kind: "text", delta: "Du har " },
      { kind: "text", delta: "620 kcal kvar." },
    ]);
  });

  /** The network splits wherever it likes, including inside a JSON object. */
  it("survives a chunk that ends mid-line", () => {
    const whole = delta("Sparat.");
    const events = drain([whole.slice(0, 14), whole.slice(14)]);

    expect(events).toEqual([{ kind: "text", delta: "Sparat." }]);
  });

  it("survives a line split across three chunks", () => {
    const whole = delta("Hej");
    const events = drain([whole.slice(0, 6), whole.slice(6, 20), whole.slice(20)]);

    expect(events).toEqual([{ kind: "text", delta: "Hej" }]);
  });

  it("reads the actions envelope that arrives after the prose", () => {
    const events = drain([
      delta("Sparat."),
      `data: ${JSON.stringify({ actions: [{ action_type: "log_meal", summary: "Måltid sparad · 118 kcal" }] })}\n\n`,
    ]);

    expect(events[1]).toEqual({
      kind: "actions",
      actions: [{ action_type: "log_meal", summary: "Måltid sparad · 118 kcal" }],
    });
  });

  it("ignores the terminator and any keep-alive noise", () => {
    expect(drain([": keep-alive\n\n", "data: [DONE]\n\n"])).toEqual([]);
  });

  /** A truncated payload must not take the stream down with it. */
  it("skips a line that is not valid JSON", () => {
    expect(drain(["data: {oops\n\n", delta("Hej")])).toEqual([{ kind: "text", delta: "Hej" }]);
  });

  it("holds a partial line rather than emitting half of it", () => {
    const buffer = { rest: "" };

    expect(sseEvents(buffer, 'data: {"choices"')).toEqual([]);
    expect(buffer.rest).toBe('data: {"choices"');
  });
});
