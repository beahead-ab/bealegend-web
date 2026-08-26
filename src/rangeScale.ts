export const FLOOR_STOP = 0.38;
export const RANGE_STOP = 0.68;
export const OVERSHOOT = 0.2;

export type RangeScale = {
  floor: number;
  ceiling: number;
};

export function rangeScale(floor: number, ceiling: number): RangeScale {
  if (!(floor > 0 && ceiling > floor)) throw new Error("golvet måste vara positivt och taket högre");
  return { floor, ceiling };
}

export function floorOnly(value: number): RangeScale {
  return { floor: value, ceiling: value * 1.25 };
}

/**
 * The interval always owns the same visual width. This keeps a narrow protein
 * interval as legible as a wider calorie interval and matches the native app.
 */
export function rangePosition(scale: RangeScale, value: number): number {
  const safe = Math.max(0, value);
  if (safe <= scale.floor) return FLOOR_STOP * (safe / scale.floor);
  if (safe <= scale.ceiling) {
    const position = (safe - scale.floor) / (scale.ceiling - scale.floor);
    return FLOOR_STOP + (RANGE_STOP - FLOOR_STOP) * position;
  }
  const position = Math.min(1, (safe - scale.ceiling) / (scale.ceiling * OVERSHOOT));
  return RANGE_STOP + (1 - RANGE_STOP) * position;
}

export const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
