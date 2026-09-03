import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentUrl, chat } from "./chat";
import { splitProse, type ThreadAction, type ThreadMessage } from "./thread";

/**
 * Thirty minutes, the same window the server uses before it distils a finished
 * conversation. A second number here would mean the floor and the coach's
 * memory disagreed about when a conversation ended.
 */
export const INACTIVITY_MS = 30 * 60 * 1000;

/** Kameran är en loggväg, inte en separat bildanalysyta. */
export const PHOTO_PROMPT = "Analysera och logga den här måltiden.";

/** Actions whose successful completion changes the numbers and meal list on
 * the day surface. Read-only actions must not cause a second overview request. */
export function changesDailyOverview(actions: ThreadAction[]): boolean {
  return actions.some(({ action_type }) => action_type === "log_meal" || action_type === "copy_meal");
}

export function imageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Filen är inte en bild."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Bilden kunde inte läsas."));
    reader.onerror = () => reject(new Error("Bilden kunde inte läsas."));
    reader.readAsDataURL(file);
  });
}

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

export function useConversation(onDailyOverviewChanged?: () => void) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [answering, setAnswering] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [finished, setFinished] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  const sendTurn = useCallback(async (text: string, image?: string) => {
    if (!text || answering) return;

    const now = new Date();
    const outgoing: ThreadMessage = {
      id: nextLocalId(),
      role: "user",
      text,
      attachmentUrl: image ?? null,
      attachmentMealId: null,
      actions: [],
      streaming: false,
      failed: false,
      createdAt: now,
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
    setPhotoError(null);
    setFinished(false);
    setLastActivity(now);

    const update = (change: (message: ThreadMessage) => ThreadMessage) =>
      setMessages((current) => current.map((message) => (message.id === placeholderId ? change(message) : message)));
    const updateOutgoing = (change: (message: ThreadMessage) => ThreadMessage) =>
      setMessages((current) => current.map((message) => (message.id === outgoing.id ? change(message) : message)));

    const controller = new AbortController();
    abort.current = controller;

    try {
      const attachment = image ? await chat.uploadAttachment(image) : null;
      if (attachment) {
        // Byt till serveradressen så samma privata bild används resten av
        // sessionen. Om svaret därefter faller står bilden ändå kvar.
        updateOutgoing((message) => ({ ...message, attachmentUrl: attachmentUrl(attachment.url) }));
      }
      await chat.stream(prompt, (event) => {
        if (event.kind === "text") {
          update((message) => ({ ...message, text: message.text + event.delta }));
        } else {
          update((message) => ({ ...message, actions: [...message.actions, ...(event.actions as ThreadAction[])] }));
          if (changesDailyOverview(event.actions)) onDailyOverviewChanged?.();
        }
      }, controller.signal, attachment?.id);
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
  }, [answering, messages, onDailyOverviewChanged]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || answering) return;
    await sendTurn(text);
  }, [answering, draft, sendTurn]);

  const sendImage = useCallback(async (file: File) => {
    if (answering) return;
    try {
      const image = await imageDataUrl(file);
      await sendTurn(PHOTO_PROMPT, image);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Bilden kunde inte läsas.");
    }
  }, [answering, sendTurn]);

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
    sendImage,
    finish,
    photoError,
    canSend: draft.trim().length > 0 && !answering,
    isActive: isConversationActive(lastActivity, finished),
    lastLine: lastAssistantLine(messages),
  };
}
