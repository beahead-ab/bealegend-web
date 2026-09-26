import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avatarDimensions, MAX_AVATAR_BYTES, prepareAvatar } from "./avatarImage";

let image: { onload: (() => void) | null; onerror: (() => void) | null; src: string };
const signal = () => new AbortController().signal;
const file = (type = "image/png") => new File(["test image"], "image", { type });
beforeEach(() => {
  vi.stubGlobal("Image", class {
    onload = null; onerror = null; src = ""; naturalWidth = 1024; naturalHeight = 768;
    constructor() { image = this; }
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("avatar JPEG preparation", () => {
  it.each([[1024, 768, 512, 384], [500, 2000, 128, 512], [100, 50, 100, 50], [1, 10000, 1, 512]])("fits %ix%i without stretching", (w, h, width, height) => {
    expect(avatarDimensions(w, h)).toEqual({ width, height });
  });
  it.each([0, -1, Infinity, NaN])("rejects invalid dimensions %i", value => expect(() => avatarDimensions(value, 20)).toThrow());
  it("re-encodes decoded pixels as JPEG with a white matte, then revokes the source URL", async () => {
    const ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const encode = vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,AA==");
    const pending = prepareAvatar(file(), signal()); image.onload!();
    expect(await pending).toBe("data:image/jpeg;base64,AA==");
    expect(ctx.fillStyle).toBe("#ffffff");
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 512, 384);
    expect(ctx.drawImage).toHaveBeenCalledWith(image, 0, 0, 512, 384);
    expect(encode).toHaveBeenCalledWith("image/jpeg", .85);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("rejects empty, oversized and non-image files before decoding", async () => {
    await expect(prepareAvatar(file("text/plain"), signal())).rejects.toThrow("Välj en bild");
    await expect(prepareAvatar(new File([], "empty", { type: "image/png" }), signal())).rejects.toThrow("5 MB");
    await expect(prepareAvatar(new File([new Uint8Array(MAX_AVATAR_BYTES + 1)], "large", { type: "image/png" }), signal())).rejects.toThrow("5 MB");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("reports unsupported HEIC decoding without sending the original file", async () => {
    const pending = prepareAvatar(file("image/heic"), signal()); image.onerror!();
    await expect(pending).rejects.toThrow("JPG- eller PNG-bild");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("cancels pending decoding and removes the temporary object URL", async () => {
    const controller = new AbortController();
    const pending = prepareAvatar(file(), controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(image.src).toBe(""); expect(image.onload).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
