import { useCallback, useEffect, useRef, useState } from "react";
import { chat } from "./chat";
import { splitProse, type ThreadAction, type ThreadMessage } from "./thread";

/**
 * Thirty minutes, the same window the server uses before it distils a finished
 * conversation. A second number here would mean the floor and the coach's
 * memory disagreed about when a conversation ended.
 */
export const INACTIVITY_MS = 30 * 60 * 1000;

export function isConversationActive(lastActivity: Date | null, finished: boolean, now = new Date()): boolean {
  if (finished || !lastActivity) return false;
  return now.getTime() - lastActivity.getTime() < INACTIVITY_MS;
}

/** The line the floor shows once you have left the thread. */
export function lastAssistantLine(messages: ThreadMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const text = splitProse(message.text).text;
    if (text) return text;
  }
  return null;
}

/**
 * What goes up to the model. Blank turns are dropped, because the server
 * rejects the whole request if any message is empty — and an answer that
 * streamed nothing leaves exactly that behind, so one silent reply would
 * poison every turn after it.
 */
export function promptFrom(messages: ThreadMessage[]): { role: string; content: string }[] {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => ({ role: message.role, content: message.text }));
}

let localId = 0;
const nextLocalId = () => `local-${(localId += 1)}`;

export function useConversation() {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [answering, setAnswering] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [finished, setFinished] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    chat
      .history()
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages);
        setCursor(page.nextCursor);
        setLastActivity(page.messages[page.messages.length - 1]?.createdAt ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, []);

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chat.history(cursor);
      setMessages((current) => [...page.messages, ...current]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }, [cursor, loadingOlder]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || answering) return;

    const now = new Date();
    const outgoing: ThreadMessage = {
      id: nextLocalId(), role: "user", text, actions: [], streaming: false, failed: false, createdAt: now,
    };
    const placeholderId = nextLocalId();
    const placeholder: ThreadMessage = {
      id: placeholderId, role: "assistant", text: "", actions: [], streaming: true, failed: false, createdAt: now,
    };

    // Built before the placeholder joins the list — an empty assistant turn
    // would otherwise be sent as content.
    const prompt = promptFrom([...messages, outgoing]);

    setMessages((current) => [...current, outgoing, placeholder]);
    setDraft("");
    setAnswering(true);
    setFinished(false);
    setLastActivity(now);

    const update = (change: (message: ThreadMessage) => ThreadMessage) =>
      setMessages((current) => current.map((message) => (message.id === placeholderId ? change(message) : message)));

    const controller = new AbortController();
    abort.current = controller;

    try {
      await chat.stream(prompt, (event) => {
        if (event.kind === "text") {
          update((message) => ({ ...message, text: message.text + event.delta }));
        } else {
          update((message) => ({ ...message, actions: [...message.actions, ...(event.actions as ThreadAction[])] }));
        }
      }, controller.signal);
      // A turn that ended without a word is not a blank bubble — it is a
      // failure that happened to return 200, and the thread should say so.
      update((message) => ({
        ...message,
        streaming: false,
        failed: message.text.trim().length === 0 ? true : message.failed,
        text: message.text.trim().length === 0 ? "Coachen svarade inte den här gången." : message.text,
      }));
    } catch {
      // The user's own words stay in the thread. Removing them because the
      // answer failed would look like the message was never sent.
      update((message) => ({
        ...message,
        streaming: false,
        failed: true,
        text: message.text || "Coachen kunde inte svara just nu.",
      }));
    } finally {
      setAnswering(false);
      setLastActivity(new Date());
      abort.current = null;
    }
  }, [answering, draft, messages]);

  const finish = useCallback(() => {
    abort.current?.abort();
    setFinished(true);
  }, []);

  return {
    messages,
    draft,
    setDraft,
    answering,
    hasMore: cursor !== null,
    loadingOlder,
    loadOlder,
    send,
    finish,
    canSend: draft.trim().length > 0 && !answering,
    isActive: isConversationActive(lastActivity, finished),
    lastLine: lastAssistantLine(messages),
  };
}
