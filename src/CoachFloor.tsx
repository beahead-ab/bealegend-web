import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { CameraIcon, MicIcon, SendIcon, StopIcon } from "./icons";
import { appendTranscript, useDictation } from "./useDictation";
import type { useConversation } from "./conversation";

type Conversation = ReturnType<typeof useConversation>;

/** Reserve the actual fixed composer's height, including attachments/errors
 * and wrapped text. A fixed 92px allowance hid the last workout controls. */
function FloorContainer({ children, inThread }: { children: ReactNode; inThread: boolean }) {
  const floor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (inThread) return; // In chat the composer participates in flex layout.
    const element = floor.current;
    const surface = element?.closest<HTMLElement>(".app-shell");
    if (!element || !surface) return;
    const measure = () => surface.style.setProperty("--floor-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      surface.style.removeProperty("--floor-height");
    };
  }, [inThread]);
  return <div className="floor" ref={floor}>{children}</div>;
}

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
    const resize = () => {
      const element = field.current;
      if (!element) return;
      element.style.height = "auto";
      element.style.height = `${Math.max(36, Math.min(element.scrollHeight, 148))}px`;
    };
    resize();
    // Both surfaces stay mounted. Their width becomes zero while hidden;
    // measure again on reveal, not just on draft or window-size changes.
    let previousWidth = -1;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width !== previousWidth) {
        previousWidth = width;
        if (width > 0) resize();
      }
    });
    if (field.current) observer?.observe(field.current);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [conversation.draft, conversation.isActive, conversation.lastLine, inThread, focused]);

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
      <FloorContainer inThread={inThread}>
        <button className="floor-ongoing" onClick={onOpenThread} data-chat-entry>
          <span className="floor-line">{conversation.lastLine}</span>
          <span className="floor-dot" aria-hidden="true" />
        </button>
      </FloorContainer>
    );
  }

  const submit = () => {
    if (!conversation.canSend) return;
    onOpenThread();
    void conversation.send();
  };

  return (
    <FloorContainer inThread={inThread}>
      <div className="floor-composer-panel">
        {conversation.issueImages.length > 0 && (
          <div className="floor-issue-preview" aria-label="Bilder till buggrapport">
            <div className="floor-issue-thumbnails">
              {conversation.issueImages.map((image, index) => (
                <img key={`${image.slice(-24)}-${index}`} src={image} alt={`Buggbild ${index + 1}`} />
              ))}
            </div>
            <span>{conversation.issueImages.length} av 4 bilder</span>
            <button type="button" onClick={conversation.clearIssueImages} disabled={conversation.answering}>Ta bort</button>
          </div>
        )}
        <div className="floor-composer">
          <input
            ref={camera}
            className="floor-file"
            type="file"
            accept="image/*"
            capture={conversation.isIssueDraft ? undefined : "environment"}
            multiple={conversation.isIssueDraft}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (!files.length) return;
              onOpenThread();
              if (conversation.isIssueDraft) void conversation.stageIssueImages(files);
              else void conversation.sendImage(files[0]);
            }}
          />
          <button
            className="floor-camera"
            onClick={() => camera.current?.click()}
            aria-label={conversation.isIssueDraft ? "Bifoga bilder till buggrapporten" : "Fotografera eller välj bild"}
            title={conversation.isIssueDraft ? "Välj upp till fyra bilder." : undefined}
            disabled={conversation.answering}
          >
            <CameraIcon />
          </button>
          <textarea
            ref={field}
            data-chat-entry
            rows={1}
            value={conversation.draft}
            aria-label={conversation.isIssueDraft ? "Buggrapport" : "Meddelande"}
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
      </div>

      {/* A microphone that is listening and one that was refused look
          identical — both produce no words. So the floor says which. */}
      {(dictation.listening || dictation.error || conversation.photoError) && (
        <p className="floor-note">
          {conversation.photoError || dictation.error || (dictation.interim ? dictation.interim : "Lyssnar … tryck på stopp när du är klar.")}
        </p>
      )}
    </FloorContainer>
  );
}
