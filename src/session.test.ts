import { describe, expect, it } from "vitest";
import { applyToCache } from "./session";
import type { SignedInUser } from "./api";

/**
 * Regeln som håller isär två personer som delar en dator, prövad i alla fyra
 * lägen en session kan hamna i. Att den bara finns på ett ställe är vad som
 * gör det möjligt att pröva den alls.
 */
describe("vad som händer med offlinecachen när en session avgörs", () => {
  function spy() {
    const calls: string[] = [];
    return {
      calls,
      cache: {
        claim: (userId: string) => { calls.push(`claim:${userId}`); },
        forget: () => { calls.push("forget"); },
      },
    };
  }

  it("tar över cachen för den som loggar in", () => {
    const { calls, cache } = spy();

    applyToCache({ status: "signedIn", user: { id: "user-casper" } }, cache);

    expect(calls).toEqual(["claim:user-casper"]);
  });

  /** Kontobyte: samma anrop, annat id. Det är claim som städar. */
  it("tar över cachen även när någon annan använt datorn", () => {
    const { calls, cache } = spy();

    applyToCache({ status: "signedIn", user: { id: "user-annan" } }, cache);

    expect(calls).toEqual(["claim:user-annan"]);
  });

  /** En utgången session är en session som tagit slut. */
  it("glömmer allt när sessionen gått ut", () => {
    const { calls, cache } = spy();

    applyToCache({ status: "signedOut" }, cache);

    expect(calls).toEqual(["forget"]);
  });

  /**
   * Ingen identitet, inget minne. En session vi inte kan tillskriva någon får
   * varken läsa eller skriva dagar — att falla stängt kostar en omhämtning.
   */
  it("glömmer allt när sessionen saknar identitet", () => {
    const { calls, cache } = spy();

    applyToCache({ status: "signedIn", user: undefined }, cache);
    // Kontraktet säger att id alltid finns. Ett svar från nätet är inte
    // typkontrollerat, och det är just det fallet skyddet finns för — därför
    // konstrueras det här med våld.
    applyToCache(
      { status: "signedIn", user: { email: "casper@beahead.se" } as unknown as SignedInUser },
      cache,
    );

    expect(calls).toEqual(["forget", "forget"]);
  });
});
