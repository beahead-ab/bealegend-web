import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as daily from "./daily";
import * as dashboard from "./dashboard";
import * as training from "./training";
import { TodayView } from "./TodayView";

vi.mock("./conversation", () => ({ useConversation: () => ({ setDraft: () => undefined }) }));
vi.mock("./CoachFloor", () => ({ CoachFloor: () => null }));
vi.mock("./CoachThread", () => ({ CoachThread: () => null }));
vi.mock("./ChangeReceipt", () => ({ ChangeReceipt: () => null }));

const reading: daily.DailyOverview = {
  date: "2026-09-12", headline: null, user: { first_name: "Test" },
  calories: { can_calculate: false, goal: 0, consumed: 0, remaining: 0, is_over: false },
  health: { steps: 4_331, step_goal: 7_000, active_calories: 0, steps_measured_at: "2026-09-12T12:00:00Z", distance_km: 3.21 },
  macros: { protein: 0, carbs: 0, fat: 0, protein_goal: null, carbs_goal: null, fat_goal: null }, meals: [],
};
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  history.replaceState({}, "", "/?d=2026-09-12");
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(daily, "fetchOverview").mockResolvedValue(reading);
  vi.spyOn(dashboard, "fetchDashboard").mockRejectedValue(new TypeError("offline"));
  vi.spyOn(training, "fetchTrainingHome").mockRejectedValue(new TypeError("offline"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = async () => { await act(async () => root.render(<TodayView user={{ id: "test-owner" }} onSignOut={() => undefined} />)); };

describe("stegmodulen i den verkliga dagsytan", () => {
  it("syns i den inbyggda ytan om dashboardkonfigurationen inte nås", async () => {
    await render();
    expect(host.querySelectorAll(".steps-module")).toHaveLength(1);
    expect(host.querySelector(".steps-module")?.textContent).toContain("4 331");
    expect(host.querySelector(".steps-module")?.textContent).toContain("Sträcka: 3,21 km");
  });

  it.each(["metricRow", "ring"])("samma modul används för personligt vald %s utan dubblering", async (presentation) => {
    vi.mocked(dashboard.fetchDashboard).mockResolvedValue({
      schema_version: "dashboard.v1", revision: 3,
      widgets: [{ binding: "daily.steps", scope: "today", presentation, size: "small" }],
    });
    await render();
    expect(host.querySelectorAll(".steps-module")).toHaveLength(1);
    expect(host.querySelector(".steps-distance")?.textContent).toBe("Sträcka: 3,21 km");
  });

  it("lägger inte till steg i en redan sparad personlig yta som saknar modulen", async () => {
    vi.mocked(dashboard.fetchDashboard).mockResolvedValue({
      schema_version: "dashboard.v1", revision: 3,
      widgets: [{ binding: "daily.protein", scope: "today", presentation: "metricRow", size: "small" }],
    });
    await render();
    expect(host.querySelector(".steps-module")).toBeNull();
  });

  it("döljer föregående dags steg direkt när datum byts och visar nästa svar", async () => {
    await render();
    let finish!: (value: daily.DailyOverview) => void;
    vi.mocked(daily.fetchOverview).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await act(async () => (host.querySelector('[aria-label="Föregående dag"]') as HTMLButtonElement).click());
    expect(host.querySelector(".steps-module")).toBeNull();
    await act(async () => finish({ ...reading, date: "2026-09-11", health: { ...reading.health, steps: 200, distance_km: 0.15 } }));
    expect(host.querySelector(".steps-module")?.textContent).toContain("200");
    expect(host.querySelector(".steps-distance")?.textContent).toBe("Sträcka: 0,15 km");
    expect(host.textContent).not.toContain("4 331");
  });

  it("återinför inte steg via reservytan för en sparad tom dashboard", async () => {
    vi.mocked(dashboard.fetchDashboard).mockResolvedValue({
      schema_version: "dashboard.v1", revision: 3, widgets: [],
    });
    await render();
    expect(host.querySelector(".steps-module")).toBeNull();
  });
});
