import { describe, expect, it } from "vitest";
import {
  INACTIVITY_MS,
  PHOTO_PROMPT,
  changesDailyOverview,
  imageDataUrl,
  isConversationActive,
  lastAssistantLine,
  promptFrom,
} from "./conversation";
import type { ThreadMessage } from "./thread";

const message = (role: ThreadMessage["role"], text: string): ThreadMessage => ({
  id: `${role}-${text}`, role, text, actions: [], streaming: false, failed: false, createdAt: new Date(),
});

const now = new Date("2026-08-21T18:40:00");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("isConversationActive", () => {
  it("is running while the window is open", () => {
    expect(isConversationActive(minutesAgo(29), false, now)).toBe(true);
  });

  /** The same thirty minutes the server waits before it distils. */
  it("has ended once the window closes", () => {
    expect(isConversationActive(minutesAgo(31), false, now)).toBe(false);
    expect(INACTIVITY_MS).toBe(30 * 60 * 1000);
  });

  it("ends immediately on Klar, however recent the last word was", () => {
    expect(isConversationActive(minutesAgo(1), true, now)).toBe(false);
  });

  it("is not running before anything has been said", () => {
    expect(isConversationActive(null, false, now)).toBe(false);
  });
});

describe("lastAssistantLine", () => {
  it("takes the coach's most recent line, not the user's", () => {
    const line = lastAssistantLine([
      message("assistant", "Första svaret."),
      message("user", "Tack!"),
    ]);

    expect(line).toBe("Första svaret.");
  });

  /** The floor must never show raw JSON, which is what a bare reply would be. */
  it("shows the prose, not the meal payload", () => {
    const line = lastAssistantLine([
      message("assistant", 'Sparat.\n```json\n{"type":"meal","description":"Kvarg","calories":118}\n```'),
    ]);

    expect(line).toBe("Sparat.");
  });

  it("skips past a reply that was only a payload", () => {
    const line = lastAssistantLine([
      message("assistant", "Du har 620 kcal kvar."),
      message("assistant", '```json\n{"type":"meal","description":"Kvarg","calories":118}\n```'),
    ]);

    expect(line).toBe("Du har 620 kcal kvar.");
  });

  it("has nothing to show in an empty thread", () => {
    expect(lastAssistantLine([])).toBeNull();
  });
});

describe("promptFrom", () => {
  /** One blank turn would make the server reject every request after it. */
  it("drops a turn with no text at all", () => {
    const prompt = promptFrom([
      message("user", "Hej"),
      message("assistant", ""),
      message("user", "Är du kvar?"),
    ]);

    expect(prompt).toEqual([
      { role: "user", content: "Hej" },
      { role: "user", content: "Är du kvar?" },
    ]);
  });

  it("drops whitespace-only turns too", () => {
    expect(promptFrom([message("assistant", "   \n ")])).toEqual([]);
  });

  it("keeps roles and order exactly as the thread has them", () => {
    const prompt = promptFrom([message("user", "A"), message("assistant", "B")]);

    expect(prompt).toEqual([
      { role: "user", content: "A" },
      { role: "assistant", content: "B" },
    ]);
  });
});

describe("kameraturen", () => {
  it("har en tydlig loggintention i samma chatt", () => {
    expect(PHOTO_PROMPT).toBe("Analysera och logga den här måltiden.");
  });

  it("läser en vald bild som den data-url backend tar emot", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "frukost.png", { type: "image/png" });

    await expect(imageDataUrl(file)).resolves.toMatch(/^data:image\/png;base64,/);
  });

  it("avvisar något som inte är en bild före nätverksanropet", async () => {
    const file = new File(["hej"], "anteckning.txt", { type: "text/plain" });

    await expect(imageDataUrl(file)).rejects.toThrow("inte en bild");
  });
});

describe("uppdatering av dagen efter chattåtgärder", () => {
  it("uppdaterar efter en ny eller kopierad måltid", () => {
    expect(changesDailyOverview([{ action_type: "log_meal", summary: "Måltid sparad" }])).toBe(true);
    expect(changesDailyOverview([{ action_type: "copy_meal", summary: "Måltid kopierad" }])).toBe(true);
  });

  it("hämtar inte om dagen efter en läsning eller dashboardändring", () => {
    expect(changesDailyOverview([{ action_type: "read_meals", summary: "Måltider lästa" }])).toBe(false);
    expect(changesDailyOverview([{ action_type: "dashboard", summary: "Dashboard ändrad" }])).toBe(false);
  });
});
