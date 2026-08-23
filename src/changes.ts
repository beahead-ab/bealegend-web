import { ApiError, request } from "./api";
import type { DashboardConfig } from "./dashboard";

/**
 * Spåret: vad som ändrats på startsidan, nyaste först.
 *
 * Servern skriver kvittot när ändringen sker, inte när spåret läses — den som
 * ändrade vet vad det gällde. Den här filen läser meningen och visar den. Den
 * skriver aldrig en egen: en text som återskapas ur skillnaden mellan två
 * widgetlistor är en gissning i klartext, och kvittot är den text användaren
 * läser oftast av alla.
 */
export type DashboardChange = {
  revision: number;
  action: string;
  binding: string | null;
  summary: string;
  /** "user" eller "legend". Skillnaden bär hela principen om vem som ändrade. */
  origin: string;
  undone: boolean;
  changed_at: string;
};

export function fetchChanges(): Promise<DashboardChange[]> {
  return request<DashboardChange[]>("/api/v1/dashboard/changes");
}

export function undoChange(): Promise<DashboardConfig> {
  return request<DashboardConfig>("/api/v1/dashboard/actions", {
    method: "POST",
    body: JSON.stringify({ action: "undo" }),
  });
}

/**
 * Raden som Ångra gäller: den nyaste, om den går att ångra.
 *
 * Servern ångrar alltid den senaste revisionen, och bara den. Att erbjuda
 * Ångra bredvid en äldre rad hade lovat något annat än vad knappen gör —
 * trycket hade tagit tillbaka den nyaste ändringen, inte den man pekade på.
 * Därför bär bara den översta raden en knapp.
 *
 * Ett ångrande går inte att ångra: ordet lovar inte ett gör-om.
 */
export function undoable(changes: DashboardChange[]): DashboardChange | null {
  const newest = changes[0];
  if (!newest) return null;
  if (newest.action === "undo" || newest.undone) return null;
  return newest;
}

/** Ett inaktuellt Ångra — någon annan flik, eller Legend, hann före. */
export function isStaleUndo(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

const DAY = 86_400_000;

/**
 * "för en stund sedan", inte ett klockslag.
 *
 * Raden läses som en mening, och ett klockslag mitt i den tvingar läsaren att
 * räkna. Dagar först när det faktiskt gått ett dygn — "i går" om något som
 * hände för nio timmar sedan är fel oftare än det är rätt.
 */
export function whenLabel(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const ago = now - at;
  if (ago < 60_000) return "nyss";
  if (ago < 3_600_000) return `för ${Math.floor(ago / 60_000)} min sedan`;
  if (ago < DAY) return `för ${Math.floor(ago / 3_600_000)} h sedan`;
  const days = Math.floor(ago / DAY);
  return days === 1 ? "i går" : `för ${days} dagar sedan`;
}
