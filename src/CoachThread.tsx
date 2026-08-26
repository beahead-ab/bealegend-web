import { Fragment, useEffect, useRef, useState } from "react";
import type { useConversation } from "./conversation";
import { CoachFloor } from "./CoachFloor";
import { actionSymbol, opensGap, receiptText, splitProse, threadDays, timeLabel } from "./thread";
import { BackIcon, MealIcon } from "./icons";

type Conversation = ReturnType<typeof useConversation>;

/** Close enough to the bottom that following the answer is what the reader
 *  wants. Anywhere above this, they are reading something and moving them is
 *  taking the thread away from them. */
const NEAR_BOTTOM_PX = 80;

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
}

/**
 * The thread (§4): one continuous conversation with day dividers, the mark as
 * the coach's avatar, and every action acknowledged rather than silent.
 */
export function CoachThread({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [behind, setBehind] = useState(false);
  const days = threadDays(conversation.messages);

  /**
   * Follow the answer only for a reader who is already at the bottom. A streamed
   * reply changes `messages` for every token, so scrolling on each change drags
   * someone reading Tuesday's answer back down several times a second.
   *
   * `scrollTop` rather than `scrollIntoView`: the latter moves the nearest
   * scrolling ancestor, which on iOS can pull the whole page under the fixed
   * floor.
   */
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (isNearBottom(element)) {
      element.scrollTop = element.scrollHeight;
      setBehind(false);
    } else {
      setBehind(true);
    }
  }, [conversation.messages]);

  const toBottom = () => {
    const element = scroll.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    setBehind(false);
  };

  return (
    <div className="thread">
      {/* A navigation bar would give this a bold centred title and blue system
          buttons. §8 keeps the chrome ink-black and spends blue on data. */}
      <header className="thread-header">
        <button className="thread-back" onClick={onClose}><BackIcon /> Chatt</button>
        <button
          className="thread-done"
          onClick={() => {
            conversation.finish();
            onClose();
          }}
          disabled={!conversation.isActive}
        >
          Klar
        </button>
      </header>

      <div
        className="thread-scroll"
        ref={scroll}
        onScroll={(event) => setBehind(!isNearBottom(event.currentTarget))}
      >
        {conversation.hasMore && (
          <button className="thread-earlier" onClick={() => void conversation.loadOlder()} disabled={conversation.loadingOlder}>
            {conversation.loadingOlder ? "Hämtar …" : "Visa tidigare samtal"}
          </button>
        )}

        {days.map((day) => (
          <div key={day.key}>
            <p className="thread-divider">{day.label}</p>
            {day.messages.map((message, index) => {
              // A stretch of talking, not a log: the time appears only where
              // the conversation actually paused.
              const gap = opensGap(message, day.messages[index - 1]);
              const stamp = gap ? <p className="thread-gap">{timeLabel(message.createdAt)}</p> : null;

              if (message.role === "user") {
                return (
                  <Fragment key={message.id}>
                    {stamp}
                    <div className="bubble-row user">
                      <p className="bubble">{message.text}</p>
                    </div>
                  </Fragment>
                );
              }

              const prose = splitProse(message.text);
              return (
                <Fragment key={message.id}>
                  {stamp}
                  <div className="bubble-row coach" aria-busy={message.streaming || undefined}>
                    <picture className="coach-avatar-picture">
                      <source media="(prefers-color-scheme: dark)" srcSet="/brandmark-reverse.png" />
                      <img src="/brandmark.png" alt="" className="coach-avatar" />
                    </picture>
                  <div className="coach-body">
                    {message.streaming && !prose.text ? (
                      <span className="floor-spinner" aria-label="Coachen skriver" />
                    ) : (
                      prose.text && <p className={message.failed ? "muted" : undefined}>{prose.text}</p>
                    )}

                    {prose.meal && <span className="chip"><MealIcon /> {receiptText(prose.meal)}</span>}

                    {message.actions.map((action) => (
                      <span className="chip done" key={`${action.action_type}-${action.summary}`}>
                        {actionSymbol(action.action_type)} {action.summary}
                      </span>
                    ))}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        ))}

        <div />
      </div>

      {behind && (
        <button className="thread-catchup" onClick={toBottom}>Nytt svar ↓</button>
      )}

      <CoachFloor conversation={conversation} onOpenThread={() => undefined} inThread />
    </div>
  );
}
