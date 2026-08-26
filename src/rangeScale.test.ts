import { describe, expect, it } from "vitest";
import { FLOOR_STOP, RANGE_STOP, rangePosition, rangeScale } from "./rangeScale";

describe("rangePosition", () => {
  const scale = rangeScale(1800, 2200);

  it("reserves the same positions for the interval boundaries", () => {
    expect(rangePosition(scale, 1800)).toBeCloseTo(FLOOR_STOP);
    expect(rangePosition(scale, 2200)).toBeCloseTo(RANGE_STOP);
  });

  it("places values continuously across the boundaries", () => {
    expect(rangePosition(scale, 1799)).toBeLessThan(FLOOR_STOP);
    expect(rangePosition(scale, 1801)).toBeGreaterThan(FLOOR_STOP);
    expect(rangePosition(scale, 2199)).toBeLessThan(RANGE_STOP);
    expect(rangePosition(scale, 2201)).toBeGreaterThan(RANGE_STOP);
  });

  it("clamps the overshoot to the track", () => {
    expect(rangePosition(scale, 10_000)).toBe(1);
  });

  it("rejects an interval that cannot be drawn", () => {
    expect(() => rangeScale(0, 100)).toThrow();
  });
});
