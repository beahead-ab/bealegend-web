import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request, staleRunFrom } from "./api";

function reply(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("reads the server's sentence out of the error envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      reply(400, { error: { code: "invalid", message: "Datumet finns inte." } }),
    ));

    await expect(request("/api/v1/dashboard")).rejects.toMatchObject({
      status: 400,
      message: "Datumet finns inte.",
      code: "invalid",
    });
  });

  it("still says something when the body is not the envelope at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })));

    let message = "";
    try {
      await request("/api/v1/dashboard");
    } catch (error) {
      message = (error as ApiError).message;
    }

    expect(message).toContain("kunde inte nås");
  });

  it("refreshes once on a 401 and retries the original call", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(401, { error: { code: "unauthorized", message: "" } }))
      .mockResolvedValueOnce(reply(200, { authenticated: true }))
      .mockResolvedValueOnce(reply(200, { revision: 3 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/v1/dashboard")).resolves.toEqual({ revision: 3 });
    expect(fetchMock.mock.calls[1][0]).toContain("/web-auth/refresh");
  });

  it("gives up rather than looping when the refresh also fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(401, { error: { code: "unauthorized", message: "Du behöver logga in igen." } }))
      .mockResolvedValueOnce(reply(401, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/v1/dashboard")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /** A rejected sign-in is an answer. Refreshing in response to it would loop. */
  it("does not try to refresh a failed sign-in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(401, { error: { code: "invalid_credentials", message: "Fel lösenord." } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/v1/web-auth/login", { method: "POST" })).rejects.toMatchObject({
      message: "Fel lösenord.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats 204 as a result rather than as empty JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(204, null)));

    await expect(request("/api/v1/chat/messages", { method: "DELETE" })).resolves.toBeUndefined();
  });
});

describe("staleRunFrom", () => {
  /** The whole reason the error body is kept instead of discarded. */
  it("hands back the run the rejection already carried", () => {
    const error = new ApiError(409, "Passet har uppdaterats på en annan enhet.", "stale_run_version", {
      current_run: { id: "abc", state_version: 7 },
    });

    expect(staleRunFrom<{ state_version: number }>(error)?.state_version).toBe(7);
  });

  it("ignores conflicts that are not about run versions", () => {
    expect(staleRunFrom(new ApiError(409, "Krock", "something_else", {}))).toBeNull();
  });

  it("ignores ordinary errors", () => {
    expect(staleRunFrom(new ApiError(500, "Serverfel"))).toBeNull();
    expect(staleRunFrom(new Error("nätverket"))).toBeNull();
  });
});
