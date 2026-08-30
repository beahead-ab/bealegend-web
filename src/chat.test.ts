import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "./api";
import { attachmentUrl, chat, sseEvents, type ChatStreamEvent } from "./chat";

/** Feeds the parser the way a socket would: in arbitrary pieces. */
function drain(chunks: string[]): ChatStreamEvent[] {
  const buffer = { rest: "" };
  return chunks.flatMap((chunk) => sseEvents(buffer, chunk));
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

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

describe("chattbilder", () => {
  it("laddar upp en data-url genom samma inloggade API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "photo-1",
      url: "/api/v1/chat/attachments/photo-1?t=key",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chat.uploadAttachment("data:image/jpeg;base64,abc")).resolves.toEqual({
      id: "photo-1",
      url: "/api/v1/chat/attachments/photo-1?t=key",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/v1/chat/attachments`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ image_data_url: "data:image/jpeg;base64,abc" }),
      }),
    );
  });

  it("skickar bilagans id i samma strömmande chattur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("data: [DONE]\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await chat.stream([{ role: "user", content: "Logga maten." }], () => undefined, undefined, "photo-1");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ role: "user", content: "Logga maten." }],
      mode: "standard",
      attachment_id: "photo-1",
    });
  });

  it("återställer tumnagel och måltidskoppling ur historiken", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      messages: [{
        id: "message-1",
        role: "user",
        content: "Logga maten.",
        created_at: "2026-08-30T08:00:00Z",
        attachment_url: "/api/v1/chat/attachments/photo-1?t=key",
        attachment_meal_id: "meal-1",
      }],
      next_cursor: null,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const page = await chat.history();

    expect(page.messages[0]).toMatchObject({
      attachmentUrl: `${API_URL}/api/v1/chat/attachments/photo-1?t=key`,
      attachmentMealId: "meal-1",
    });
  });

  it("behåller redan absoluta och lokala bildadresser", () => {
    expect(attachmentUrl("https://cdn.example/photo.jpg")).toBe("https://cdn.example/photo.jpg");
    expect(attachmentUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });
});
