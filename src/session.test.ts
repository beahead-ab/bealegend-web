import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { signInMessage } from "./session";

/**
 * Which failure the user is told about decides whether they go hunting for a
 * mistake they did not make.
 */
describe("signInMessage", () => {
  it("passes the server's own sentence through on a rejected sign-in", () => {
    expect(signInMessage(new ApiError(401, "Fel e-post eller lösenord.", "invalid_credentials")))
      .toBe("Fel e-post eller lösenord.");
  });

  it("has a sentence of its own when the server sends none", () => {
    expect(signInMessage(new ApiError(401, "", "invalid_credentials")))
      .toBe("Fel e-post eller lösenord.");
  });

  /** Telling someone their password is wrong when the network dropped is a lie. */
  it("does not blame the password for a server failure", () => {
    const message = signInMessage(new ApiError(503, "", "unavailable"));

    expect(message).not.toContain("lösenord");
    expect(message).toContain("Försök igen");
  });

  it("says something useful about an error that is not ours at all", () => {
    expect(signInMessage(new TypeError("Failed to fetch"))).toContain("Försök igen");
  });
});
