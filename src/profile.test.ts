import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { profileApi, profileError, profileFrom } from "./profile";

const envelope = (avatar: string | null = null) => ({ profile: { full_name: "Test Person", email: "test@example.invalid", avatar_url: avatar } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe("profile contract shared with iOS", () => {
  it("loads settings with the existing cookie session, without a client owner id", async () => {
    const fetch = vi.fn().mockResolvedValue(response(envelope())); vi.stubGlobal("fetch", fetch);
    expect(await profileApi.load()).toEqual({ fullName: "Test Person", email: "test@example.invalid", avatarUrl: null });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/settings"), expect.objectContaining({
      method: "POST", body: JSON.stringify({ action: "get" }), credentials: "include",
    }));
  });
  it("sends JPEG to the avatar endpoint and keeps the server cache version", async () => {
    const url = "https://example.invalid/avatars/test.jpg?v=123";
    const fetch = vi.fn().mockResolvedValue(response(envelope(url))); vi.stubGlobal("fetch", fetch);
    expect((await profileApi.upload("data:image/jpeg;base64,AA==")).avatarUrl).toBe(url);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/v1/settings/avatar"), expect.objectContaining({
      method: "POST", body: '{"image_data_url":"data:image/jpeg;base64,AA=="}', credentials: "include",
    }));
  });
  it("deletes only the authenticated user's avatar", async () => {
    const fetch = vi.fn().mockResolvedValue(response(envelope())); vi.stubGlobal("fetch", fetch);
    expect((await profileApi.remove()).avatarUrl).toBeNull();
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it.each(["upload", "remove"] as const)("does not refresh or replay %s on 401", async (method) => {
    const fetch = vi.fn().mockResolvedValue(response({ error: { message: "Expired" } }, 401)); vi.stubGlobal("fetch", fetch);
    await expect(method === "upload" ? profileApi.upload("data:image/jpeg;base64,AA==") : profileApi.remove()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not claim success from a partial upload or delete response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(envelope())).mockResolvedValueOnce(response(envelope("https://example.invalid/a.jpg"))));
    await expect(profileApi.upload("jpeg")).rejects.toThrow("kunde inte bekräftas");
    await expect(profileApi.remove()).rejects.toThrow("kunde inte bekräftas");
  });
  it.each([null, {}, { profile: {} }, { profile: "bad" }, { profile: [] }, envelope("http://example.invalid/a.jpg"), envelope("javascript:alert(1)"), envelope("https://user:secret@example.invalid/a.jpg")])("rejects malformed or unsafe profiles (%j)", (body) => {
    expect(() => profileFrom(body)).toThrow();
  });
  it("gives safe login, permission, storage and uncertain outcome messages", () => {
    expect(profileError(new ApiError(401, "raw"))).toContain("logga in igen");
    expect(profileError(new ApiError(403, "raw"))).toContain("behörighet");
    expect(profileError(new ApiError(502, "Profilbilder är inte aktiverade ännu.", "avatar_storage_unavailable"))).toBe("Profilbilder är inte aktiverade ännu.");
    expect(profileError(new Error("secret server details"))).not.toContain("secret");
    expect(profileError(new Error())).toContain("Hämta profilen igen");
  });
});
