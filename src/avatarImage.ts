export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export function avatarDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error("Bilden kunde inte läsas.");
  }
  const scale = Math.min(1, 512 / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

/** Decode locally, strip metadata and always send JPEG, just like iOS. */
export async function prepareAvatar(file: File, signal: AbortSignal): Promise<string> {
  if (!TYPES.has(file.type)) throw new Error("Välj en bild i JPG-, PNG- eller WebP-format.");
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error("Bilden får vara högst 5 MB och får inte vara tom.");
  signal.throwIfAborted();
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); image.src = ""; reject(new DOMException("Avbruten", "AbortError")); };
      image.onload = () => { cleanup(); resolve(); };
      image.onerror = () => { cleanup(); reject(new Error("Bilden kunde inte läsas. Prova en JPG- eller PNG-bild.")); };
      signal.addEventListener("abort", abort, { once: true });
      image.src = url;
    });
    signal.throwIfAborted();
    const size = avatarDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bilden kunde inte förberedas i den här webbläsaren.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    if (!data.startsWith("data:image/jpeg;base64,") || data.length > MAX_AVATAR_BYTES / 3 * 4) {
      throw new Error("Bilden kunde inte förberedas. Prova en annan bild.");
    }
    return data;
  } finally { URL.revokeObjectURL(url); }
}
