import { useCallback, useEffect, useRef } from "react";
import { CameraIcon, MicIcon, SendIcon, StopIcon } from "./icons";
import { appendTranscript, useDictation } from "./useDictation";
import type { useConversation } from "./conversation";

type Conversation = ReturnType<typeof useConversation>;

/**
 * The floor (§3): one row, on every surface, that is the app's primary way in.
 * Three faces — resting, composing, and a conversation still running.
 */
export function CoachFloor({
  conversation,
  onOpenThread,
  inThread,
  focused = false,
}: {
  conversation: Conversation;
  onOpenThread: () => void;
  inThread: boolean;
  focused?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const dictation = useDictation(
    useCallback(
      (spoken: string) => conversation.setDraft(appendTranscript(conversation.draft, spoken)),
      [conversation],
    ),
  );

  // Grows with the text to a ceiling, then scrolls inside itself. Never
  // truncated, never an ellipsis (§3.2).
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 148)}px`;
  }, [conversation.draft]);

  // A keyboard user who opens the panel has already chosen to speak. Move the
  // caret into the same field once it is visible; closing returns focus to the
  // entry point on the underlying surface in TodayView.
  useEffect(() => {
    if (!focused) return;
    const frame = window.requestAnimationFrame(() => field.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focused]);

  // §3.3: away from the thread, with a conversation still running, the floor
  // shows the coach's last line and a dot instead of an empty field.
  if (!inThread && conversation.isActive && conversation.lastLine) {
    return (
      <div className="floor">
        <button className="floor-ongoing" onClick={onOpenThread} data-chat-entry>
          <span className="floor-line">{conversation.lastLine}</span>
          <span className="floor-dot" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const submit = () => {
    if (!conversation.canSend) return;
    onOpenThread();
    void conversation.send();
  };

  return (
    <div className="floor">
      <div className="floor-composer">
        <input
          ref={camera}
          className="floor-file"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            onOpenThread();
            void conversation.sendImage(file);
          }}
        />
        <button
          className="floor-camera"
          onClick={() => camera.current?.click()}
          aria-label="Fotografera eller välj bild"
          disabled={conversation.answering}
        >
          <CameraIcon />
        </button>
        <textarea
          ref={field}
          data-chat-entry
          rows={1}
          value={conversation.draft}
          placeholder="Fråga, logga eller be om något …"
          onChange={(event) => conversation.setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, shift+enter breaks the line — what a chat field is
            // expected to do, and the reason the field is a textarea at all.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />

        {/* Listening outranks send. Dictation fills the field as it hears, so
            without this the button you press to stop vanishes under the send
            button on the first word spoken — the bug iOS found. */}
        {dictation.listening ? (
          <button className="floor-stop" onClick={dictation.toggle} aria-label="Sluta diktera"><StopIcon /></button>
        ) : conversation.answering ? (
          <span className="floor-spinner" aria-label="Coachen svarar" />
        ) : conversation.canSend ? (
          <button className="floor-send" onClick={submit} aria-label="Skicka"><SendIcon /></button>
        ) : dictation.supported ? (
          <button className="floor-mic" onClick={dictation.toggle} aria-label="Diktera"><MicIcon /></button>
        ) : (
          <button className="floor-send" disabled aria-label="Skicka"><SendIcon /></button>
        )}
      </div>

      {/* A microphone that is listening and one that was refused look
          identical — both produce no words. So the floor says which. */}
      {(dictation.listening || dictation.error || conversation.photoError) && (
        <p className="floor-note">
          {conversation.photoError || dictation.error || (dictation.interim ? dictation.interim : "Lyssnar … tryck på stopp när du är klar.")}
        </p>
      )}
    </div>
  );
}
