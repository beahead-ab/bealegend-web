import { useCallback, useEffect, useRef } from "react";
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
}: {
  conversation: Conversation;
  onOpenThread: () => void;
  inThread: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
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

  // §3.3: away from the thread, with a conversation still running, the floor
  // shows the coach's last line and a dot instead of an empty field.
  if (!inThread && conversation.isActive && conversation.lastLine) {
    return (
      <div className="floor">
        <button className="floor-ongoing" onClick={onOpenThread}>
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
        <textarea
          ref={field}
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
          <button className="floor-stop" onClick={dictation.toggle} aria-label="Sluta diktera">■</button>
        ) : conversation.answering ? (
          <span className="floor-spinner" aria-label="Coachen svarar" />
        ) : conversation.canSend ? (
          <button className="floor-send" onClick={submit} aria-label="Skicka">↑</button>
        ) : dictation.supported ? (
          <button className="floor-mic" onClick={dictation.toggle} aria-label="Diktera">🎙</button>
        ) : (
          <button className="floor-send" disabled aria-label="Skicka">↑</button>
        )}
      </div>

      {/* A microphone that is listening and one that was refused look
          identical — both produce no words. So the floor says which. */}
      {(dictation.listening || dictation.error) && (
        <p className="floor-note">
          {dictation.error || (dictation.interim ? dictation.interim : "Lyssnar … tryck på stopp när du är klar.")}
        </p>
      )}
    </div>
  );
}
