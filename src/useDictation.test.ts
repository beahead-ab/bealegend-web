import { describe, expect, it } from "vitest";
import { appendTranscript, dictationErrorMessage } from "./useDictation";

/**
 * The two pure pieces. Recognition itself needs a browser and a microphone, so
 * what is worth pinning down is what happens to the text and what the user is
 * told when it fails.
 */
describe("appendTranscript", () => {
  it("adds to what is already written rather than replacing it", () => {
    expect(appendTranscript("Knappen", "hamnar fel")).toBe("Knappen hamnar fel");
  });

  it("does not double the space when the field already ends in one", () => {
    expect(appendTranscript("Knappen ", "hamnar fel")).toBe("Knappen hamnar fel");
  });

  it("starts cleanly in an empty field", () => {
    expect(appendTranscript("", "  Knappen hamnar fel  ")).toBe("Knappen hamnar fel");
  });

  it("leaves the text alone when nothing was heard", () => {
    expect(appendTranscript("Knappen", "   ")).toBe("Knappen");
  });
});

describe("dictationErrorMessage", () => {
  it("tells a blocked microphone apart from a silent one", () => {
    expect(dictationErrorMessage("not-allowed")).toContain("blockerad");
    expect(dictationErrorMessage("no-speech")).toContain("Hörde ingenting");
  });

  it("has something to say about an error it has never seen", () => {
    expect(dictationErrorMessage("something-new")).toBe("Dikteringen avbröts.");
  });
});
