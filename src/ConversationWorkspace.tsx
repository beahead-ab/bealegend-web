import type { ReactNode } from "react";

/**
 * One conversation, beside the surface where there is room and over it where
 * there is not. The thread stays mounted while closed so scroll position,
 * streamed replies and local interaction state survive the fold.
 */
export function ConversationWorkspace({
  open,
  content,
  thread,
}: {
  open: boolean;
  content: ReactNode;
  thread: ReactNode;
}) {
  return (
    <div className={open ? "conversation-workspace chat-open" : "conversation-workspace"}>
      <main className="workspace-content">{content}</main>
      <aside className="workspace-thread" aria-label="Samtal med Legend" hidden={!open}>
        {thread}
      </aside>
    </div>
  );
}
