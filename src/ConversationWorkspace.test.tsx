// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationWorkspace } from "./ConversationWorkspace";

describe("ConversationWorkspace", () => {
  it("keeps one content surface and one conversation mounted while closed", () => {
    const html = renderToStaticMarkup(
      <ConversationWorkspace
        open={false}
        content={<p>Dashboard</p>}
        thread={<p>Conversation</p>}
      />,
    );

    expect(html.match(/Dashboard/g)).toHaveLength(1);
    expect(html.match(/Conversation/g)).toHaveLength(1);
    expect(html).toContain("hidden");
    expect(html).not.toContain("chat-open");
  });

  it("reveals that same conversation beside the content when open", () => {
    const html = renderToStaticMarkup(
      <ConversationWorkspace
        open
        content={<p>Program</p>}
        thread={<p>Conversation</p>}
      />,
    );

    expect(html).toContain("conversation-workspace chat-open");
    expect(html).not.toContain("hidden");
    expect(html).toContain("Program");
    expect(html).toContain("Conversation");
  });
});
