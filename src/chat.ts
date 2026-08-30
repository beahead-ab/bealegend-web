import { API_URL, request } from "./api";
import type { ThreadAction, ThreadMessage, ThreadRole } from "./thread";

export type ChatStreamEvent =
  | { kind: "text"; delta: string }
  | { kind: "actions"; actions: ThreadAction[] };

/**
 * Turns raw SSE text into events. Written as a generator over chunks rather
 * than over a socket so it can be tested exactly as the network delivers it —
 * split mid-line, mid-JSON, mid-anything.
 *
 * `EventSource` would have been the obvious tool and cannot be used: it only
 * issues GET, and the chat endpoint is a POST carrying the conversation.
 */
export function sseEvents(buffer: { rest: string }, chunk: string): ChatStreamEvent[] {
  const events: ChatStreamEvent[] = [];
  buffer.rest += chunk;

  // Everything up to the last newline is complete; whatever follows is a
  // partial line and waits for the next chunk.
  const lastBreak = buffer.rest.lastIndexOf("\n");
  if (lastBreak === -1) return events;

  const lines = buffer.rest.slice(0, lastBreak).split("\n");
  buffer.rest = buffer.rest.slice(lastBreak + 1);

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;

    let envelope: { choices?: { delta?: { content?: string } }[]; actions?: ThreadAction[] };
    try {
      envelope = JSON.parse(payload);
    } catch {
      continue;
    }

    const delta = envelope.choices?.[0]?.delta?.content;
    if (delta) events.push({ kind: "text", delta });
    if (envelope.actions?.length) events.push({ kind: "actions", actions: envelope.actions });
  }

  return events;
}

type HistoryPayload = {
  messages: {
    id: string;
    role: string;
    content: string;
    created_at: string;
    attachment_url?: string | null;
    attachment_meal_id?: string | null;
  }[];
  next_cursor: string | null;
};

export type HistoryPage = { messages: ThreadMessage[]; nextCursor: string | null };

export type ChatAttachment = { id: string; url: string };

/**
 * Bilageadressen från backend är avsiktligt relativ. Den innehåller sin egen
 * privata läsnyckel, men ska fortfarande hämtas från API-värden när webb och
 * backend ligger på olika domäner.
 */
export function attachmentUrl(path: string): string {
  if (/^(?:data:|blob:|https?:\/\/)/i.test(path)) return path;
  return `${API_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export const chat = {
  /** Newest first from the server; reversed here so the thread reads downwards. */
  async history(before?: string, limit = 40): Promise<HistoryPage> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set("before", before);
    const payload = await request<HistoryPayload>(`/api/v1/chat/messages?${query}`);
    return {
      messages: payload.messages
        .map((message) => ({
          id: message.id,
          role: (message.role as ThreadRole) ?? "assistant",
          text: message.content,
          attachmentUrl: message.attachment_url ? attachmentUrl(message.attachment_url) : null,
          attachmentMealId: message.attachment_meal_id ?? null,
          actions: [],
          streaming: false,
          failed: false,
          createdAt: new Date(message.created_at),
        }))
        .reverse(),
      nextCursor: payload.next_cursor,
    };
  },

  deleteHistory: () => request<void>("/api/v1/chat/messages", { method: "DELETE" }),

  /** Bilden finns före turen, så ett avbrutet AI-svar aldrig tappar fotot. */
  uploadAttachment: (imageDataUrl: string) =>
    request<ChatAttachment>("/api/v1/chat/attachments", {
      method: "POST",
      body: JSON.stringify({ image_data_url: imageDataUrl }),
    }),

  /**
   * Streams one turn, calling back per event. Prose arrives as deltas; whatever
   * the turn *did* arrives once at the end as an actions envelope.
   */
  async stream(
    messages: { role: string; content: string }[],
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
    attachmentId?: string,
  ): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/chat/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        messages: messages.slice(-40),
        mode: "standard",
        ...(attachmentId ? { attachment_id: attachmentId } : {}),
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error("Coachen kunde inte svara just nu.");
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const buffer = { rest: "" };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of sseEvents(buffer, value)) onEvent(event);
    }
  },
};
