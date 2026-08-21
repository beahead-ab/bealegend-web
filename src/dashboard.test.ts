import { describe, expect, it } from "vitest";
import { sections, type DashboardWidget } from "./dashboard";

const widget = (binding: string, presentation = "metricRow"): DashboardWidget => ({
  binding,
  scope: "today",
  presentation,
  size: "small",
});

/**
 * Ported from the iOS client's DashboardSectionTests, case for case. The
 * configuration decides both what is shown and in what order, and grouping has
 * to honour the order rather than tidy it.
 */
describe("sections", () => {
  it("puts consecutive widgets of one group in one card", () => {
    const result = sections([
      widget("daily.energyBudget"),
      widget("daily.protein"),
      widget("training.todaySession"),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].group).toBe("Näring");
    expect(result[0].widgets).toHaveLength(2);
    expect(result[1].group).toBe("Träning");
  });

  it("lets order decide which card comes first", () => {
    const result = sections([widget("training.todaySession"), widget("daily.energyBudget")]);

    expect(result[0].group).toBe("Träning");
  });

  /** Merging these would quietly reorder the surface the user asked for. */
  it("keeps a group split when another interrupts it", () => {
    const result = sections([
      widget("daily.protein"),
      widget("training.todaySession"),
      widget("daily.energyBudget"),
    ]);

    expect(result.map((section) => section.group)).toEqual(["Näring", "Träning", "Näring"]);
  });

  it("skips a binding this build does not know", () => {
    const result = sections([widget("daily.protein"), widget("future.somethingElse")]);

    expect(result).toHaveLength(1);
    expect(result[0].widgets.map((w) => w.binding)).toEqual(["daily.protein"]);
  });

  it("skips a form this build cannot draw", () => {
    expect(sections([widget("daily.protein", "ring")])).toHaveLength(0);
  });

  /** The one place a binding's name and its home disagree. */
  it("puts steps under Hälsa despite the daily prefix", () => {
    expect(sections([widget("daily.steps")])[0].group).toBe("Hälsa");
  });
});
