import { useEffect, useRef } from "react";
import type { useConversation } from "./conversation";
import { CoachFloor } from "./CoachFloor";
import { actionSymbol, receiptText, splitProse, threadDays } from "./thread";

type Conversation = ReturnType<typeof useConversation>;

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
  const bottom = useRef<HTMLDivElement>(null);
  const days = threadDays(conversation.messages);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [conversation.messages]);

  return (
    <div className="thread">
      {/* A navigation bar would give this a bold centred title and blue system
          buttons. §8 keeps the chrome ink-black and spends blue on data. */}
      <header className="thread-header">
        <button className="thread-back" onClick={onClose}>‹ Chatt</button>
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

      <div className="thread-scroll">
        {conversation.hasMore && (
          <button className="thread-earlier" onClick={() => void conversation.loadOlder()} disabled={conversation.loadingOlder}>
            {conversation.loadingOlder ? "Hämtar …" : "Visa tidigare samtal"}
          </button>
        )}

        {days.map((day) => (
          <div key={day.key}>
            <p className="thread-divider">{day.label}</p>
            {day.messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div className="bubble-row user" key={message.id}>
                    <p className="bubble">{message.text}</p>
                  </div>
                );
              }

              const prose = splitProse(message.text);
              return (
                <div className="bubble-row coach" key={message.id}>
                  <img src="/brandmark.png" alt="" className="coach-avatar" />
                  <div className="coach-body">
                    {message.streaming && !prose.text ? (
                      <span className="floor-spinner" aria-label="Coachen skriver" />
                    ) : (
                      prose.text && <p className={message.failed ? "muted" : undefined}>{prose.text}</p>
                    )}

                    {prose.meal && <span className="chip">🍽 {receiptText(prose.meal)}</span>}

                    {message.actions.map((action) => (
                      <span className="chip done" key={`${action.action_type}-${action.summary}`}>
                        {actionSymbol(action.action_type)} {action.summary}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottom} />
      </div>

      <CoachFloor conversation={conversation} onOpenThread={() => undefined} inThread />
    </div>
  );
}
