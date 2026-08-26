import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Ring } from "./widgets";

describe("Ring", () => {
  it("visar ett mätt värde utan att hitta på noll procent när mål saknas", () => {
    const html = renderToStaticMarkup(<Ring label="Vätska" value="0,8 l" progress={null} />);

    expect(html).toContain("Vätska: 0,8 l");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("ring-fill");
  });
});
