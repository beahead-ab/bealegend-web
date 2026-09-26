import { ApiError, request } from "./api";

export type Profile = { fullName: string | null; email: string | null; avatarUrl: string | null };

/** Only a confirmed server response changes the saved picture. */
export function profileFrom(body: unknown): Profile {
  const profile = (body as { profile?: Record<string, unknown> } | null)?.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile) || !("avatar_url" in profile)) {
    throw new Error("Profilen kunde inte bekräftas. Hämta igen.");
  }
  const avatar = profile.avatar_url;
  if (avatar !== null) {
    if (typeof avatar !== "string") throw new Error("Profilbildens adress kunde inte läsas.");
    let url: URL;
    try { url = new URL(avatar); } catch { throw new Error("Profilbildens adress kunde inte läsas."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Profilbildens adress är inte säker.");
  }
  return {
    fullName: typeof profile.full_name === "string" ? profile.full_name : null,
    email: typeof profile.email === "string" ? profile.email : null,
    avatarUrl: avatar as string | null,
  };
}

export const profileApi = {
  load: async (signal?: AbortSignal): Promise<Profile> => profileFrom(await request("/api/v1/settings", {
    method: "POST", body: JSON.stringify({ action: "get" }), signal,
  })),
  upload: async (imageDataUrl: string, signal?: AbortSignal): Promise<Profile> => {
    // Do not replay a picture mutation after authentication changes or a lost
    // response. A fresh read lets the person see what actually got saved.
    const profile = profileFrom(await request("/api/v1/settings/avatar", {
      method: "POST", body: JSON.stringify({ image_data_url: imageDataUrl }), signal,
    }, false));
    if (!profile.avatarUrl) throw new Error("Den sparade bilden kunde inte bekräftas. Hämta igen.");
    return profile;
  },
  remove: async (signal?: AbortSignal): Promise<Profile> => {
    const profile = profileFrom(await request("/api/v1/settings/avatar", { method: "DELETE", signal }, false));
    if (profile.avatarUrl) throw new Error("Borttagningen kunde inte bekräftas. Hämta igen.");
    return profile;
  },
};

export function profileError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Du behöver logga in igen innan du ändrar profilbilden.";
    if (error.status === 403) return "Du har inte behörighet att ändra profilbilden.";
    if (error.code === "avatar_storage_unavailable") return error.message;
  }
  return "Ändringen kunde inte bekräftas. Hämta profilen igen innan du försöker på nytt.";
}
