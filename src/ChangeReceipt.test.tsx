// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChangeReceipt } from "./ChangeReceipt";
import * as changes from "./changes";
import type { DashboardChange } from "./changes";

const change = (over: Partial<DashboardChange> = {}): DashboardChange => ({
  revision: 4,
  action: "move",
  binding: "training.todaySession",
  summary: "Dagens pass ligger överst nu.",
  origin: "user",
  undone: false,
  changed_at: new Date().toISOString(),
  ...over,
});

async function markupFor(rows: DashboardChange[]): Promise<string> {
  vi.spyOn(changes, "fetchChanges").mockResolvedValue(rows);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ChangeReceipt onUndone={vi.fn()} />);
  });
  const html = host.innerHTML;
  await act(async () => root.unmount());
  host.remove();
  return html;
}

/**
 * `#53` — en startsida som rört sig utan att någon bett om det är obegriplig
 * tills man vet vem som flyttade något.
 *
 * Märket fanns i den utfällda listan men saknades på den nyaste raden — alltså
 * överallt utom på den enda rad en Legend-ändring producerar.
 */
describe("kvittots nyaste rad säger vem som ändrade", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("namnger Legend på den nyaste raden", async () => {
    expect(await markupFor([change({ origin: "legend" })])).toContain("Legend");
  });

  it("namnger inte användaren hennes egen ändring", async () => {
    expect(await markupFor([change({ origin: "user" })])).not.toContain("Legend");
  });

  it("visar ändå kvittots mening", async () => {
    expect(await markupFor([change({ origin: "legend" })])).toContain("Dagens pass ligger överst nu.");
  });
});
