import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoachThread } from "./CoachThread";
import type { useConversation } from "./conversation";

function conversation(): ReturnType<typeof useConversation> {
  return {
    messages: [{
      id: "message-1",
      role: "user",
      text: "Analysera och logga den här måltiden.",
      attachmentUrl: "https://api.example/photo.jpg",
      attachmentMealId: "meal-1",
      actions: [],
      streaming: false,
      failed: false,
      createdAt: new Date("2026-08-30T08:00:00Z"),
    }],
    draft: "",
    setDraft: vi.fn(),
    answering: false,
    hasMore: false,
    loadingOlder: false,
    loadOlder: vi.fn(),
    send: vi.fn(),
    sendImage: vi.fn(),
    finish: vi.fn(),
    photoError: null,
    canSend: false,
    isActive: true,
    lastLine: null,
  };
}

describe("chattbildens yta", () => {
  it("visar tumnagel, måltidskvitto och kameran i samma chatt", () => {
    const html = renderToStaticMarkup(<CoachThread conversation={conversation()} onClose={() => undefined} />);

    expect(html).toContain('src="https://api.example/photo.jpg"');
    expect(html).toContain("Måltid sparad");
    expect(html).toContain('aria-label="Fotografera eller välj bild"');
    expect(html).not.toContain("data:image");
  });
});
