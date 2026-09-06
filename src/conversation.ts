import { useCallback, useEffect, useRef, useState } from "react";
import { attachmentUrl, chat, type ChatAttachment } from "./chat";
import { splitProse, type ThreadAction, type ThreadMessage } from "./thread";

/**
 * Thirty minutes, the same window the server uses before it distils a finished
 * conversation. A second number here would mean the floor and the coach's
 * memory disagreed about when a conversation ended.
 */
export const INACTIVITY_MS = 30 * 60 * 1000;

/** Kameran är en loggväg, inte en separat bildanalysyta. */
export const PHOTO_PROMPT = "Analysera och logga den här måltiden.";
export const MAX_ISSUE_IMAGES = 4;
const ISSUE_PREFIX = /^\s*issue\s*:/i;

export function isIssueCommand(text: string): boolean {
  return ISSUE_PREFIX.test(text);
}

export function issueDescription(text: string): string | null {
  if (!isIssueCommand(text)) return null;
  const description = text.replace(ISSUE_PREFIX, "").trim();
  return description || null;
}

export function deliveryForText(text: string): "bug_report" | "coach" {
  return isIssueCommand(text) ? "bug_report" : "coach";
}

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
  const [issueImages, setIssueImages] = useState<string[]>([]);
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
      attachmentUrls: image ? [image] : [],
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
        const url = attachmentUrl(attachment.url);
        updateOutgoing((message) => ({ ...message, attachmentUrl: url, attachmentUrls: [url] }));
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

  const submitIssue = useCallback(async (text: string) => {
    if (!issueDescription(text) || answering) return;

    const now = new Date();
    const images = [...issueImages];
    const outgoingId = nextLocalId();
    const placeholderId = nextLocalId();
    const outgoing: ThreadMessage = {
      id: outgoingId,
      role: "user",
      text,
      attachmentUrl: images[0] ?? null,
      attachmentUrls: images,
      attachmentMealId: null,
      actions: [],
      streaming: false,
      failed: false,
      createdAt: now,
    };
    const placeholder: ThreadMessage = {
      id: placeholderId,
      role: "assistant",
      text: "",
      actions: [],
      streaming: true,
      failed: false,
      createdAt: now,
    };

    setMessages((current) => [...current, outgoing, placeholder]);
    setAnswering(true);
    setPhotoError(null);
    setFinished(false);
    setLastActivity(now);

    const update = (id: string, change: (message: ThreadMessage) => ThreadMessage) =>
      setMessages((current) => current.map((message) => (message.id === id ? change(message) : message)));

    try {
      const uploaded: ChatAttachment[] = [];
      for (const image of images) uploaded.push(await chat.uploadAttachment(image));
      const urls = uploaded.map((attachment) => attachmentUrl(attachment.url));
      update(outgoingId, (message) => ({
        ...message,
        attachmentUrl: urls[0] ?? null,
        attachmentUrls: urls,
      }));
      const receipt = await chat.submitBugReport(text, uploaded.map((attachment) => attachment.id));
      update(placeholderId, (message) => ({
        ...message,
        text: receipt.confirmation,
        streaming: false,
      }));
      setDraft("");
      setIssueImages([]);
    } catch (error) {
      update(placeholderId, (message) => ({
        ...message,
        text: error instanceof Error ? error.message : "Buggrapporten kunde inte sparas just nu.",
        streaming: false,
        failed: true,
      }));
    } finally {
      setAnswering(false);
      setLastActivity(new Date());
    }
  }, [answering, issueImages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || answering) return;
    if (deliveryForText(text) === "bug_report") await submitIssue(text);
    else await sendTurn(text);
  }, [answering, draft, sendTurn, submitIssue]);

  const sendImage = useCallback(async (file: File) => {
    if (answering) return;
    try {
      const image = await imageDataUrl(file);
      await sendTurn(PHOTO_PROMPT, image);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Bilden kunde inte läsas.");
    }
  }, [answering, sendTurn]);

  const stageIssueImages = useCallback(async (files: File[]) => {
    if (answering || files.length === 0) return;
    if (!isIssueCommand(draft)) {
      setPhotoError("Skriv issue: följt av felet innan du bifogar buggbilder.");
      return;
    }
    if (issueImages.length + files.length > MAX_ISSUE_IMAGES) {
      setPhotoError("Högst fyra bilder kan bifogas till en buggrapport.");
      return;
    }
    try {
      const images = await Promise.all(files.map(imageDataUrl));
      setIssueImages((current) => [...current, ...images]);
      setPhotoError(null);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Bilden kunde inte läsas.");
    }
  }, [answering, draft, issueImages.length]);

  const finish = useCallback(() => {
    abort.current?.abort();
    setFinished(true);
  }, []);

  const updateDraft = useCallback((value: string) => {
    setDraft(value);
    if (!isIssueCommand(value)) setIssueImages([]);
  }, []);

  return {
    messages,
    draft,
    setDraft: updateDraft,
    answering,
    hasMore: cursor !== null,
    loadingOlder,
    loadOlder,
    send,
    sendImage,
    stageIssueImages,
    issueImages,
    clearIssueImages: () => setIssueImages([]),
    isIssueDraft: isIssueCommand(draft),
    finish,
    photoError,
    canSend: draft.trim().length > 0
      && (!isIssueCommand(draft) || issueDescription(draft) !== null)
      && !answering,
    isActive: isConversationActive(lastActivity, finished),
    lastLine: lastAssistantLine(messages),
  };
}
